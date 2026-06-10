import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native'
import type { PlaceDetailsResult, PlaceSearchResult } from '../lib/googlePlaces'
import { fetchPlaceDetails } from '../lib/googlePlaces'
import { pickMediaMultiple, resolveMediaUri, uploadMedia, VideoTooLongError, MAX_VIDEO_SECONDS } from '../lib/media'
import {
  addMediaToVisit,
  createOrGetPlace,
  createVisitMemory,
  deleteMedia,
  getMemoryDetail,
  setHeroMedia,
  updateMediaLocation,
  updateVisitMemoryFields,
} from '../services/memories'
import type { Media, MemoryDetail, Visibility } from '../types/database'

interface Props {
  visible: boolean
  onClose: () => void
  userId: string | null
  searchPlace?: PlaceSearchResult | null
  memoryId?: string | null
  onSaved?: (memoryId: string, place: PlaceSearchResult) => void
  onChanged?: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const UNSUPPORTED_MSG = '우리는 사진 저장 앱입니다. 이 기능은 지원하지 않아요!'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const EXPANDED_DRAG = -200 // dragY 기준 확장 상태 안착 지점
const SPRING_CONFIG = { tension: 60, friction: 11, useNativeDriver: false as const }

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))
}

export function PlaceDetailSheet({
  visible,
  onClose,
  userId,
  searchPlace,
  memoryId,
  onSaved,
  onChanged,
}: Props) {
  const [currentId, setCurrentId] = useState<string | null>(memoryId ?? null)
  const [detail, setDetail] = useState<MemoryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [hoursExpanded, setHoursExpanded] = useState(false)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [placeDetails, setPlaceDetails] = useState<PlaceDetailsResult | null>(null)

  const sheetRef = useRef(null)
  // 단일 드래그 값: 음수 = 위로(시트 확장), 양수 = 아래로(시트 내려감/닫기)
  const dragY = useRef(new Animated.Value(0)).current
  const dragBase = useRef(0)

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.locationY < 60,
        onMoveShouldSetPanResponder: (evt, gestureState) =>
          evt.nativeEvent.locationY < 60 && Math.abs(gestureState.dy) > 5,
        onPanResponderGrant: () => {
          dragBase.current = sheetExpanded ? EXPANDED_DRAG : 0
        },
        onPanResponderMove: (_, gestureState) => {
          // 위로는 저항감 있게(0.5배), 아래로는 손가락을 그대로 따라오게
          const delta = gestureState.dy < 0 ? gestureState.dy * 0.5 : gestureState.dy
          dragY.setValue(Math.max(EXPANDED_DRAG, dragBase.current + delta))
        },
        onPanResponderRelease: (_, gestureState) => {
          const { dy, vy } = gestureState
          const flickDown = vy > 0.8
          const flickUp = vy < -0.8
          if ((dy > 80 || flickDown) && !flickUp) {
            if (sheetExpanded) {
              animateLayout()
              setSheetExpanded(false)
              Animated.spring(dragY, { toValue: 0, velocity: vy, ...SPRING_CONFIG }).start()
            } else {
              // 아래로 밀어내며 자연스럽게 닫기
              Animated.timing(dragY, { toValue: 600, duration: 220, useNativeDriver: false }).start(
                () => {
                  onClose()
                  dragY.setValue(0)
                }
              )
            }
          } else if (dy < -80 || flickUp) {
            animateLayout()
            setSheetExpanded(true)
            Animated.spring(dragY, { toValue: EXPANDED_DRAG, velocity: vy, ...SPRING_CONFIG }).start()
          } else {
            Animated.spring(dragY, {
              toValue: sheetExpanded ? EXPANDED_DRAG : 0,
              velocity: vy,
              ...SPRING_CONFIG,
            }).start()
          }
        },
      }),
    [onClose, sheetExpanded, dragY]
  )

  const [visitedAt, setVisitedAt] = useState(todayIso())
  const [note, setNote] = useState('')
  const [isSaved, setIsSaved] = useState(true)
  const [visibility, setVisibility] = useState<Visibility>('private')

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const d = await getMemoryDetail(id)
      setDetail(d)
      setVisitedAt(d.memory.visited_at?.slice(0, 10) || todayIso())
      setNote(d.memory.note ?? '')
      setIsSaved(d.memory.is_saved)
      setVisibility(d.memory.visibility)
    } catch (e) {
      Alert.alert('불러오기 실패', String((e as Error).message))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    if (memoryId) {
      setCurrentId(memoryId)
      void load(memoryId)
    } else {
      setCurrentId(null)
      setDetail(null)
      setVisitedAt(todayIso())
      setNote('')
      setIsSaved(true)
      setVisibility('private')
    }
    setActiveTab(0)
    setHoursExpanded(false)
    setSheetExpanded(false)
    setIsEditing(false)
    setSelectedMediaId(null)
    dragY.setValue(0)
  }, [visible, memoryId, load, dragY])

  // Google Places 상세 정보 로드 (실패해도 기본 정보는 표시)
  const googlePlaceId = searchPlace?.googlePlaceId ?? detail?.place?.google_place_id ?? null
  useEffect(() => {
    if (!visible || !googlePlaceId) {
      setPlaceDetails(null)
      return
    }
    let cancelled = false
    fetchPlaceDetails(googlePlaceId)
      .then((d) => {
        if (!cancelled) setPlaceDetails(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [visible, googlePlaceId])

  const placeName = detail?.place?.display_name ?? searchPlace?.name ?? '장소'
  const placeAddress = detail?.place?.address ?? searchPlace?.address ?? null
  const media = detail?.media ?? []

  const selectedMediaIndex = media.findIndex(m => m.id === selectedMediaId)
  const canGoNext = selectedMediaIndex < media.length - 1
  const canGoPrev = selectedMediaIndex > 0

  const selectMedia = (id: string | null) => {
    animateLayout()
    setSelectedMediaId(id)
  }

  const goToNextPhoto = () => {
    if (canGoNext) {
      setSelectedMediaId(media[selectedMediaIndex + 1]?.id ?? null)
    }
  }

  const goToPrevPhoto = () => {
    if (canGoPrev) {
      setSelectedMediaId(media[selectedMediaIndex - 1]?.id ?? null)
    }
  }

  const handleEditToggle = () => {
    setEditLoading(true)
    setTimeout(() => {
      animateLayout()
      setIsEditing(!isEditing)
      setEditLoading(false)
    }, 100)
  }

  const handleCall = () => {
    const phone = placeDetails?.internationalPhoneNumber
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => {})
    } else {
      handleUnsupported('통화')
    }
  }

  const renderPhotoLayout = () => {
    const count = media.length
    if (count === 0) return null
    if (count === 1) {
      return (
        <View style={styles.photoLayoutSingle}>
          {media.map((m) => {
            const uri = resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
            const isSelected = m.id === selectedMediaId
            return uri ? (
              <Pressable
                key={m.id}
                style={[styles.photoLayoutSingleItem, isSelected && styles.photoSelected]}
                onLongPress={() => selectMedia(m.id)}
              >
                <Image source={{ uri }} style={styles.photoImage} />
                {isSelected && (
                  <View style={styles.photoNavOverlay}>
                    <Pressable style={styles.photoNavBtn} onPress={goToPrevPhoto} disabled={!canGoPrev}>
                      <Text style={styles.photoNavText}>‹</Text>
                    </Pressable>
                    <Pressable style={styles.photoNavBtn} onPress={goToNextPhoto} disabled={!canGoNext}>
                      <Text style={styles.photoNavText}>›</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            ) : null
          })}
        </View>
      )
    }
    if (count === 2) {
      const layout = count === 2 ? 'vertical' : 'horizontal'
      return (
        <ScrollView
          horizontal={layout === 'horizontal'}
          showsHorizontalScrollIndicator={layout === 'horizontal'}
          style={layout === 'vertical' ? styles.photoLayoutDouble : styles.photoLayoutDoubleH}
          scrollEnabled={layout === 'horizontal'}
        >
          <View style={layout === 'vertical' ? {} : styles.photoLayoutDoubleHContainer}>
            {media.map((m) => {
              const uri = resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
              const isSelected = m.id === selectedMediaId
              return uri ? (
                <Pressable
                  key={m.id}
                  style={[
                    layout === 'vertical' ? styles.photoLayoutDoubleItem : styles.photoLayoutDoubleHItem,
                    isSelected && styles.photoSelected,
                  ]}
                  onLongPress={() => selectMedia(m.id)}
                >
                  <Image source={{ uri }} style={styles.photoImage} />
                  {isSelected && (
                    <View style={styles.photoNavOverlay}>
                      <Pressable style={styles.photoNavBtn} onPress={goToPrevPhoto} disabled={!canGoPrev}>
                        <Text style={styles.photoNavText}>‹</Text>
                      </Pressable>
                      <Pressable style={styles.photoNavBtn} onPress={goToNextPhoto} disabled={!canGoNext}>
                        <Text style={styles.photoNavText}>›</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ) : null
            })}
          </View>
        </ScrollView>
      )
    }
    if (count >= 3) {
      const isTopSelected = media[0]?.id === selectedMediaId
      return (
        <View style={styles.photoLayoutTriple}>
          <Pressable
            style={[styles.photoLayoutTripleTop, isTopSelected && styles.photoSelected]}
            onLongPress={() => selectMedia(media[0]?.id ?? null)}
          >
            {resolveMediaUri(media[0]?.thumbnail_512 ?? media[0]?.storage_path) && (
              <Image
                source={{ uri: resolveMediaUri(media[0]?.thumbnail_512 ?? media[0]?.storage_path) as string }}
                style={styles.photoImage}
              />
            )}
            {isTopSelected && (
              <View style={styles.photoNavOverlay}>
                <Pressable style={styles.photoNavBtn} onPress={goToPrevPhoto} disabled={!canGoPrev}>
                  <Text style={styles.photoNavText}>‹</Text>
                </Pressable>
                <Pressable style={styles.photoNavBtn} onPress={goToNextPhoto} disabled={!canGoNext}>
                  <Text style={styles.photoNavText}>›</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
          <View style={styles.photoLayoutTripleBottom}>
            {media.slice(1, 3).map((m) => {
              const isSelected = m.id === selectedMediaId
              return (
                <Pressable
                  key={m.id}
                  style={[styles.photoLayoutTripleBottomItem, isSelected && styles.photoSelected]}
                  onLongPress={() => selectMedia(m.id)}
                >
                  {resolveMediaUri(m.thumbnail_512 ?? m.storage_path) && (
                    <Image source={{ uri: resolveMediaUri(m.thumbnail_512 ?? m.storage_path) as string }} style={styles.photoImage} />
                  )}
                  {isSelected && (
                    <View style={styles.photoNavOverlay}>
                      <Pressable style={styles.photoNavBtn} onPress={goToPrevPhoto} disabled={!canGoPrev}>
                        <Text style={styles.photoNavText}>‹</Text>
                      </Pressable>
                      <Pressable style={styles.photoNavBtn} onPress={goToNextPhoto} disabled={!canGoNext}>
                        <Text style={styles.photoNavText}>›</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>
        </View>
      )
    }
  }

  const handleSave = async () => {
    if (!userId) {
      Alert.alert('로그인 필요', '저장하려면 먼저 로그인해야 해요.')
      return
    }
    setSaving(true)
    try {
      if (currentId) {
        await updateVisitMemoryFields(currentId, {
          visitedAt,
          note: note || null,
          visibility,
          isSaved: !isSaved,
        })
        await load(currentId)
        onChanged?.()
        Alert.alert('저장됨', '기록을 업데이트했어요.')
      } else if (searchPlace) {
        const place = await createOrGetPlace({
          googlePlaceId: searchPlace.googlePlaceId,
          displayName: searchPlace.name,
          address: searchPlace.address,
          latitude: searchPlace.latitude,
          longitude: searchPlace.longitude,
        })
        const memory = await createVisitMemory({
          placeId: place.id,
          visitedAt,
          note: note || null,
          visibility,
          isSaved: !isSaved,
        })
        setCurrentId(memory.id)
        await load(memory.id)
        onSaved?.(memory.id, searchPlace)
        onChanged?.()
        Alert.alert('저장됨', '내가 갔던 곳에 추가했어요.')
      }
    } catch (e) {
      Alert.alert('저장 실패', String((e as Error).message))
    } finally {
      setSaving(false)
      setIsDirty(false)
    }
  }

  const handleAddMedia = async () => {
    if (!userId) {
      Alert.alert('로그인 필요', '사진/영상을 추가하려면 먼저 로그인해주세요.')
      return
    }
    if (!currentId) return
    try {
      const pickedList = await pickMediaMultiple()
      if (!pickedList.length) return
      for (const picked of pickedList) {
        const isDuplicate = media.some(m => m.storage_path === picked.uri)
        if (isDuplicate) {
          Alert.alert('이미 추가됨', '이미 추가된 사진입니다.')
          continue
        }
        const uploaded = await uploadMedia(userId, currentId, picked.uri, picked.mediaType)
        await addMediaToVisit({
          visitId: currentId,
          storagePath: uploaded.storagePath,
          mediaType: picked.mediaType,
          durationSeconds: picked.durationSeconds,
          thumbnail128: uploaded.thumbnail128,
          thumbnail512: uploaded.thumbnail512,
          width: picked.width,
          height: picked.height,
          capturedAt: picked.capturedAt,
          latitude: picked.latitude,
          longitude: picked.longitude,
        })
      }
      await load(currentId)
      onChanged?.()
    } catch (e) {
      if (e instanceof VideoTooLongError) {
        Alert.alert('영상이 너무 길어요', `${MAX_VIDEO_SECONDS}초 이하 영상만 추가할 수 있어요.`)
      } else if ((e as Error).message === 'PERMISSION_DENIED') {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요해요.')
      } else {
        Alert.alert('추가 실패', String((e as Error).message))
      }
    }
  }

  const handleUnsupported = (featureName: string) => {
    Alert.alert(featureName, UNSUPPORTED_MSG)
  }

  const tabs = ['개요', '메뉴', '리뷰', '사진', '업데이트', '정보']

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            maxHeight: dragY.interpolate({
              inputRange: [EXPANDED_DRAG, 0],
              outputRange: ['92%', '88%'],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                translateY: dragY.interpolate({
                  inputRange: [0, 600],
                  outputRange: [0, 600],
                  extrapolateLeft: 'clamp',
                }),
              },
            ],
          },
        ]}
        ref={sheetRef}
        {...panResponder.panHandlers}
      >
        {/* Drag Handle */}
        <View style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.headerContainer}>
              <View style={styles.headerLeft}>
                {/* Place Name */}
                <Text style={styles.placeName} numberOfLines={2}>
                  {placeName}
                </Text>

                {/* Subtitle */}
                <Text style={styles.subtitle} numberOfLines={1}>
                  {placeAddress || '주소 정보 없음'}
                </Text>

                {/* Rating Row */}
                {placeDetails?.rating != null && (
                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingNumber}>{placeDetails.rating.toFixed(1)}</Text>
                    {[...Array(Math.round(placeDetails.rating))].map((_, i) => (
                      <Text key={i} style={styles.starIcon}>
                        ⭐
                      </Text>
                    ))}
                    {placeDetails.userRatingCount != null && (
                      <Text style={styles.reviewCount}>
                        ({placeDetails.userRatingCount.toLocaleString()})
                      </Text>
                    )}
                  </View>
                )}

                {/* Category */}
                {placeDetails?.primaryTypeDisplayName?.text ? (
                  <Text style={styles.category}>{placeDetails.primaryTypeDisplayName.text}</Text>
                ) : null}

                {/* Status */}
                {placeDetails?.regularOpeningHours?.openNow != null && (
                  <Text
                    style={[
                      styles.statusText,
                      placeDetails.regularOpeningHours.openNow ? styles.statusOpen : styles.statusClosed,
                    ]}
                  >
                    {placeDetails.regularOpeningHours.openNow ? '영업 중' : '영업 종료'}
                  </Text>
                )}
              </View>

              {/* Header Icon Buttons */}
              <View style={styles.headerIconsContainer}>
                <Pressable
                  style={[styles.headerIconBtn, isSaved && styles.headerIconBtnActive]}
                  onPress={handleSave}
                >
                  <Image
                    source={isSaved ? require('../../assets/icons/bookmark-check.png') : require('../../assets/icons/bookmark.png')}
                    style={styles.headerIcon}
                  />
                </Pressable>

                <Pressable style={styles.headerIconBtn} onPress={() => handleUnsupported('공유')}>
                  <Image source={require('../../assets/icons/share.png')} style={styles.headerIcon} />
                </Pressable>

                <Pressable style={styles.headerIconBtn} onPress={onClose}>
                  <Image source={require('../../assets/icons/close.png')} style={styles.headerIcon} />
                </Pressable>
              </View>
            </View>

            {/* Action Buttons - Horizontal Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.actionButtonsScroll}
              contentContainerStyle={styles.actionButtonsContainer}
            >
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => handleUnsupported('경로')}
              >
                <Image source={require('../../assets/icons/direction.png')} style={styles.actionIcon} />
                <Text style={styles.actionBtnTextPrimary}>경로</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => handleUnsupported('시작')}
              >
                <Image source={require('../../assets/icons/navigate.png')} style={styles.actionIcon} />
                <Text style={styles.actionBtnText}>시작</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={handleCall}
              >
                <Image source={require('../../assets/icons/phone.png')} style={styles.actionIcon} />
                <Text style={styles.actionBtnText}>통화</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={handleSave}
              >
                <Image
                  source={isSaved ? require('../../assets/icons/bookmark-check.png') : require('../../assets/icons/bookmark.png')}
                  style={styles.actionIcon}
                />
                <Text style={styles.actionBtnText}>{isSaved ? '저장됨' : '저장'}</Text>
              </Pressable>
            </ScrollView>

            {/* Photo Section */}
            {!sheetExpanded && media.length > 0 && renderPhotoLayout()}

            {sheetExpanded ? (
              <View style={styles.photoGridContainer}>
                <View style={styles.photoGrid}>
                  {media.length > 0 ? (
                    <>
                      {media.map((m) => {
                        const uri = resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
                        return uri ? (
                          <View key={m.id} style={styles.photoGridItem}>
                            <Image source={{ uri }} style={styles.photoImage} />
                          </View>
                        ) : null
                      })}
                      {[...Array(Math.max(1, 3 - media.length))].map((_, i) => (
                        <Pressable
                          key={`extra-${i}`}
                          style={styles.photoGridItem}
                          onPress={handleAddMedia}
                        >
                          <View style={styles.photoAddPlaceholder}>
                            <Text style={styles.photoAddIcon}>📷</Text>
                            <Text style={styles.photoAddLabel}>추가</Text>
                          </View>
                        </Pressable>
                      ))}
                    </>
                  ) : (
                    <>
                      {[...Array(6)].map((_, i) => (
                        <Pressable
                          key={`new-${i}`}
                          style={styles.photoGridItem}
                          onPress={handleAddMedia}
                        >
                          <View style={styles.photoAddPlaceholder}>
                            <Text style={styles.photoAddIcon}>📷</Text>
                            <Text style={styles.photoAddLabel}>추가</Text>
                          </View>
                        </Pressable>
                      ))}
                    </>
                  )}
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photoStripScroll}
                contentContainerStyle={styles.photoStripContainer}
              >
                {media.length > 0 ? (
                  <>
                    {media.map((m) => {
                      const uri = resolveMediaUri(m.thumbnail_512 ?? m.storage_path)
                      return uri ? (
                        <View key={m.id} style={styles.photoItem}>
                          <Image source={{ uri }} style={styles.photoImage} />
                        </View>
                      ) : null
                    })}
                    {[...Array(Math.max(1, 3 - media.length))].map((_, i) => (
                      <Pressable
                        key={`extra-${i}`}
                        style={styles.photoItem}
                        onPress={handleAddMedia}
                      >
                        <View style={styles.photoAddPlaceholder}>
                          <Text style={styles.photoAddIcon}>📷</Text>
                          <Text style={styles.photoAddLabel}>사진 드래그</Text>
                          <Text style={styles.photoAddSubLabel}>or browse files</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <>
                    {[...Array(3)].map((_, i) => (
                      <Pressable
                        key={`new-${i}`}
                        style={styles.photoItem}
                        onPress={handleAddMedia}
                      >
                        <View style={styles.photoAddPlaceholder}>
                          <Text style={styles.photoAddIcon}>📷</Text>
                          <Text style={styles.photoAddLabel}>사진 드래그</Text>
                          <Text style={styles.photoAddSubLabel}>or browse files</Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}
              </ScrollView>
            )}

            {/* Tab Bar */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabBarScroll}
              contentContainerStyle={styles.tabBarContainer}
            >
              {tabs.map((tab, idx) => (
                <Pressable
                  key={tab}
                  style={styles.tabItem}
                  onPress={() => setActiveTab(idx)}
                >
                  <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>
                    {tab}
                  </Text>
                  {activeTab === idx && <View style={styles.tabUnderline} />}
                </Pressable>
              ))}
            </ScrollView>

            {/* Business Hours Row */}
            <Pressable
              style={styles.infoRow}
              onPress={() => {
                animateLayout()
                setHoursExpanded(!hoursExpanded)
              }}
            >
              <View style={styles.infoIconContainer}>
                <Image source={require('../../assets/icons/clock.png')} style={styles.infoIcon} />
              </View>
              <Text style={styles.infoLabel}>영업시간</Text>
              <View style={styles.infoChevronContainer}>
                <Image
                  source={hoursExpanded ? require('../../assets/icons/chevron-down.png') : require('../../assets/icons/chevron-right.png')}
                  style={styles.infoChevronIcon}
                />
              </View>
            </Pressable>

            {hoursExpanded && (
              <View style={styles.hoursContent}>
                <Text style={styles.hoursText}>
                  {placeDetails?.regularOpeningHours?.weekdayDescriptions?.length
                    ? placeDetails.regularOpeningHours.weekdayDescriptions.join('\n')
                    : '영업시간 정보 없음'}
                </Text>
              </View>
            )}

            {/* Edit Button */}
            <View style={styles.editButtonContainer}>
              <Pressable
                style={[styles.editButton, isEditing && styles.editButtonActive, editLoading && styles.editButtonLoading]}
                onPress={handleEditToggle}
                disabled={editLoading}
              >
                {editLoading ? (
                  <ActivityIndicator size="small" color={isEditing ? '#fff' : '#666'} />
                ) : (
                  <Text style={[styles.editButtonText, isEditing && { color: '#fff' }]}>
                    {isEditing ? '수정완료' : '수정'}
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
    flex: 1,
  },
  sheetExpanded: {
    maxHeight: '92%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 3,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#C7C7CC',
    borderRadius: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // HEADER
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EAED',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.4,
    lineHeight: 25,
  },
  subtitle: {
    fontSize: 12.5,
    color: '#70757A',
    lineHeight: 17,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  ratingNumber: {
    fontWeight: '700',
    color: '#1a1a1a',
    fontSize: 12,
  },
  starIcon: {
    fontSize: 11,
  },
  reviewCount: {
    fontSize: 12,
    color: '#70757A',
  },
  separator: {
    fontSize: 12,
    color: '#70757A',
    marginHorizontal: 2,
  },
  transitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
  },
  transitText: {
    fontSize: 12,
    color: '#70757A',
  },
  category: {
    fontSize: 12.5,
    color: '#70757A',
    marginTop: 3,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '500',
    marginTop: 2,
  },
  statusOpen: {
    color: '#137333',
  },
  statusClosed: {
    color: '#C62828',
  },
  statusClosing: {
    color: '#EA8600',
  },

  // Header Icon Buttons
  headerIconsContainer: {
    flexDirection: 'column',
    gap: 6,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  headerIconBtnActive: {
    backgroundColor: '#1C7B6C',
    borderColor: '#1C7B6C',
  },
  headerIcon: {
    width: 17,
    height: 17,
    resizeMode: 'contain',
  },

  // ACTION BUTTONS
  actionButtonsScroll: {
    paddingHorizontal: 16,
  },
  actionButtonsContainer: {
    paddingVertical: 12,
    gap: 8,
    paddingBottom: 10,
  },
  actionBtn: {
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionBtnPrimary: {
    backgroundColor: '#1C7B6C',
  },
  actionBtnSecondary: {
    backgroundColor: '#D8EEE9',
  },
  actionBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C7B6C',
  },
  actionIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },

  // PHOTO STRIP
  photoStripScroll: {
    marginBottom: 12,
  },
  photoStripContainer: {
    height: 250,
    paddingHorizontal: 16,
    gap: 3,
  },
  photoItem: {
    width: 160,
    height: 250,
    borderRadius: 4,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoAddPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
    borderStyle: 'dashed',
  },
  photoAddIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  photoAddLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  photoAddSubLabel: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 2,
  },

  // PHOTO GRID (Expanded)
  photoGridContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  photoGridItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },

  // PHOTO LAYOUTS (Collapsed state)
  photoLayoutSingle: {
    height: 300,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoLayoutSingleItem: {
    width: '100%',
    height: '100%',
  },
  photoLayoutDouble: {
    height: 300,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  photoLayoutDoubleItem: {
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  photoLayoutDoubleH: {
    height: 250,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  photoLayoutDoubleHContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  photoLayoutDoubleHItem: {
    width: 250,
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoLayoutTriple: {
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  photoLayoutTripleTop: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 6,
  },
  photoLayoutTripleBottom: {
    flexDirection: 'row',
    height: 140,
    gap: 6,
  },
  photoLayoutTripleBottomItem: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // PHOTO SELECTION & NAVIGATION
  photoSelected: {
    borderWidth: 3,
    borderColor: '#1C7B6C',
  },
  photoNavOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  photoNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoNavText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },

  // TAB BAR
  tabBarScroll: {
    marginTop: 4,
  },
  tabBarContainer: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8EAED',
  },
  tabItem: {
    paddingVertical: 11,
    paddingHorizontal: 13,
    position: 'relative',
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#70757A',
    letterSpacing: -0.2,
  },
  tabTextActive: {
    color: '#1C7B6C',
    fontWeight: '700',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1.5,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: '#1C7B6C',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // BUSINESS HOURS
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  infoIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  infoChevronContainer: {
    width: 17,
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  infoChevronIcon: {
    width: 17,
    height: 17,
    resizeMode: 'contain',
  },
  hoursContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
  },
  hoursText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },

  // EDIT BUTTON
  editButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
  },
  editButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonActive: {
    backgroundColor: '#1C7B6C',
  },
  editButtonLoading: {
    opacity: 0.7,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  editButtonActiveText: {
    color: '#fff',
  },
})
