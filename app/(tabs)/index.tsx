import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PlaceDetailSheet } from '../../src/components/PlaceDetailSheet'
import { edgeFunctionUrl, hasGoogleMapsKey } from '../../src/lib/config'
import { searchPlaces, type PlaceSearchResult } from '../../src/lib/googlePlaces'
import { loadMapMarkers, type MapMarker } from '../../src/services/memories'
import { useAuth } from '../../src/hooks/useAuth'

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

interface SavedMarker {
  memoryId: string
  place: PlaceSearchResult
  isSaved: boolean
  listColor: string | null
}

interface Cluster {
  id: string
  count: number
  latitude: number
  longitude: number
  markers: SavedMarker[]
}

const CLUSTER_THRESHOLD = 100

function computeClusters(markers: SavedMarker[], region: Region): Cluster[] {
  const cellLat = region.latitudeDelta / 6
  const cellLng = region.longitudeDelta / 6
  const map = new Map<string, SavedMarker[]>()
  for (const m of markers) {
    const row = Math.floor(m.place.latitude / cellLat)
    const col = Math.floor(m.place.longitude / cellLng)
    const key = `${row}:${col}`
    const bucket = map.get(key) ?? []
    bucket.push(m)
    map.set(key, bucket)
  }
  const clusters: Cluster[] = []
  let idx = 0
  for (const bucket of map.values()) {
    const lat = bucket.reduce((s, m) => s + m.place.latitude, 0) / bucket.length
    const lng = bucket.reduce((s, m) => s + m.place.longitude, 0) / bucket.length
    clusters.push({ id: String(idx++), count: bucket.length, latitude: lat, longitude: lng, markers: bucket })
  }
  return clusters
}

function createPlacesSessionToken() {
  return `photomap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function markerFromMapMarker(m: MapMarker): SavedMarker {
  return {
    memoryId: m.memoryId,
    place: {
      googlePlaceId: m.placeId,
      name: m.displayName,
      address: null,
      latitude: m.latitude,
      longitude: m.longitude,
      heroPhotoUrl: m.heroThumbnail,
    },
    isSaved: m.isSaved,
    listColor: m.listColor,
  }
}

// 사진 있으면 사진 마커, 없으면 저장 목록 색상 점 마커
function MapPin({ color = '#111111', size = 36 }: { color?: string; size?: number }) {
  const w = size * 0.72
  const h = size
  return (
    <Svg width={w} height={h} viewBox="0 0 36 50">
      <Path
        d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 32 18 32S36 31.5 36 18C36 8.06 27.94 0 18 0z"
        fill={color}
      />
      <Circle cx="18" cy="18" r="8" fill="white" opacity={0.9} />
    </Svg>
  )
}

function SavedMarkerContent({ marker }: { marker: SavedMarker }) {
  const thumb = marker.place.heroPhotoUrl
  if (thumb) {
    return (
      <View style={[styles.photoMarker, marker.listColor ? { borderColor: marker.listColor } : null]}>
        <Image source={{ uri: thumb }} style={styles.photoMarkerImage} />
      </View>
    )
  }
  return <MapPin color={marker.listColor ?? '#111111'} size={36} />
}

export default function MapScreen() {
  const { userId } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{
    openMemoryId?: string
    placeId?: string
    placeName?: string
    placeAddress?: string
    focusLat?: string
    focusLng?: string
  }>()
  const mapRef = useRef<MapView>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [savedMarkers, setSavedMarkers] = useState<SavedMarker[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  const [currentRegion, setCurrentRegion] = useState<Region>(SEOUL)
  const [markersError, setMarkersError] = useState(false)

  const [sheetPlace, setSheetPlace] = useState<PlaceSearchResult | null>(null)
  const [sheetMemoryId, setSheetMemoryId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const clusters = useMemo<Cluster[]>(
    () => (savedMarkers.length > CLUSTER_THRESHOLD ? computeClusters(savedMarkers, currentRegion) : []),
    [savedMarkers, currentRegion]
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTokenRef = useRef<string | null>(null)
  // focus 파라미터로 진입했으면 현재위치 자동 센터링이 덮어쓰지 않게 막음
  const focusActiveRef = useRef(false)

  // 마운트 시점에 focus 파라미터가 있으면 그 좌표에서 바로 시작 (SEOUL 깜빡임 방지)
  const initialRegionRef = useRef<Region>(
    (() => {
      const lat = Number(params.focusLat)
      const lng = Number(params.focusLng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      }
      return SEOUL
    })()
  )

  // 위치 권한 요청 + 현재 위치 획득
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status !== 'granted') return
        return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      })
      .then((pos) => {
        if (!pos) return
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        setUserLocation(loc)
        if (focusActiveRef.current) return
        mapRef.current?.animateToRegion({
          ...loc,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        })
      })
      .catch(() => {})
  }, [])

  // DB에서 내 기록 마커 로드
  useEffect(() => {
    if (!userId) return
    setMarkersError(false)
    loadMapMarkers()
      .then((markers) => setSavedMarkers(markers.map(markerFromMapMarker)))
      .catch(() => setMarkersError(true))
  }, [userId])

  // 기록/목록에서 넘어온 진입: 장소 검색에서 그 장소를 선택한 것과 동일하게 처리
  useEffect(() => {
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
    const memoryId = one(params.openMemoryId)
    if (!memoryId || memoryId === 'undefined') return

    const placeId = one(params.placeId)
    const lat = Number(one(params.focusLat))
    const lng = Number(one(params.focusLng))

    if (placeId && Number.isFinite(lat) && Number.isFinite(lng)) {
      const place: PlaceSearchResult = {
        googlePlaceId: placeId,
        name: one(params.placeName) || '장소',
        address: one(params.placeAddress) || null,
        latitude: lat,
        longitude: lng,
        heroPhotoUrl: null,
      }
      focusActiveRef.current = true
      setResults([])
      setSheetMemoryId(memoryId)
      setSheetPlace(place)
      setSheetOpen(true)
      const region = { latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      // 탭 전환 직후 한 번은 무시될 수 있어 시점 분산 (같은 좌표 중복 무해)
      for (const delay of [80, 500, 1200]) {
        setTimeout(() => mapRef.current?.animateToRegion(region, 350), delay)
      }
    } else {
      setSheetMemoryId(memoryId)
      setSheetPlace(null)
      setSheetOpen(true)
    }
    router.setParams({ openMemoryId: '', placeId: '', placeName: '', placeAddress: '', focusLat: '', focusLng: '' })
  }, [params.openMemoryId, params.placeId, params.placeName, params.placeAddress, params.focusLat, params.focusLng, router])

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return
      // Edge Function 경로는 클라이언트 키가 필요 없음 — 둘 다 없을 때만 차단
      if (!hasGoogleMapsKey && !edgeFunctionUrl) {
        Alert.alert(
          '검색 비활성화',
          'Google Maps API 키가 설정되지 않았어요.\nGOOGLE_MAPS_API_KEY 를 설정해주세요.'
        )
        return
      }
      setSearching(true)
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = createPlacesSessionToken()
        }
        const res = await searchPlaces(q, userLocation ?? undefined, sessionTokenRef.current)
        setResults(res)
        if (res[0]) {
          mapRef.current?.animateToRegion({
            latitude: res[0].latitude,
            longitude: res[0].longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          })
        }
      } catch (e) {
        Alert.alert('검색 실패', String((e as Error).message))
      } finally {
        setSearching(false)
      }
    },
    [userLocation]
  )

  const handleSearchInput = useCallback(
    (text: string) => {
      setQuery(text)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (!text.trim()) {
        setResults([])
        sessionTokenRef.current = null
        return
      }
      debounceRef.current = setTimeout(() => {
        void doSearch(text)
      }, 300)
    },
    [doSearch]
  )

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      sessionTokenRef.current = null
      return
    }
    void doSearch(query)
  }, [query, doSearch])

  const openSearchPlace = (p: PlaceSearchResult) => {
    setResults([])
    setSheetMemoryId(null)
    setSheetPlace(p)
    setSheetOpen(true)
    mapRef.current?.animateToRegion({
      latitude: p.latitude,
      longitude: p.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    })
  }

  const openSavedMarker = (m: SavedMarker) => {
    setSheetPlace(null)
    setSheetMemoryId(m.memoryId)
    setSheetOpen(true)
  }

  const handleSaved = (memoryId: string, place: PlaceSearchResult) => {
    sessionTokenRef.current = null
    setSavedMarkers((prev) => {
      const without = prev.filter((m) => m.memoryId !== memoryId)
      return [...without, { memoryId, place, isSaved: true, listColor: null }]
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={initialRegionRef.current}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={setCurrentRegion}
      >
        {savedMarkers.length > CLUSTER_THRESHOLD
          ? clusters.map((cluster) => {
              if (cluster.count === 1) {
                const m = cluster.markers[0]
                return (
                  <Marker
                    key={`c-${cluster.id}`}
                    coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                    title={m.place.name}
                    tracksViewChanges={false}
                    onPress={() => openSavedMarker(m)}
                  >
                    <SavedMarkerContent marker={m} />
                  </Marker>
                )
              }
              return (
                <Marker
                  key={`c-${cluster.id}`}
                  coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                  tracksViewChanges={false}
                  onPress={() => {
                    mapRef.current?.animateToRegion({
                      latitude: cluster.latitude,
                      longitude: cluster.longitude,
                      latitudeDelta: currentRegion.latitudeDelta / 2,
                      longitudeDelta: currentRegion.longitudeDelta / 2,
                    })
                  }}
                >
                  <View style={styles.clusterBubble}>
                    <Text style={styles.clusterText}>{cluster.count}</Text>
                  </View>
                </Marker>
              )
            })
          : savedMarkers.map((m) => (
              <Marker
                key={m.memoryId}
                coordinate={{ latitude: m.place.latitude, longitude: m.place.longitude }}
                title={m.place.name}
                tracksViewChanges={false}
                onPress={() => openSavedMarker(m)}
              >
                <SavedMarkerContent marker={m} />
              </Marker>
            ))}
        {results.map((r) => (
          <Marker
            key={r.googlePlaceId}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            title={r.name}
            description={r.address ?? undefined}
            tracksViewChanges={false}
            onPress={() => openSearchPlace(r)}
          />
        ))}
      </MapView>

      {/* 마커 로드 실패 배너 */}
      {markersError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>기록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.</Text>
        </View>
      )}

      {/* 검색바 + 내 위치 버튼 */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="장소 검색"
            value={query}
            onChangeText={handleSearchInput}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          <Pressable style={styles.searchBtn} onPress={handleSearchSubmit}>
            {searching ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchBtnText}>검색</Text>
            )}
          </Pressable>
        </View>
        <Pressable
          style={styles.myLocationBtn}
          onPress={() => {
            if (userLocation) {
              mapRef.current?.animateToRegion({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 350)
            }
          }}
        >
          <Text style={styles.myLocationBtnText}>⊕</Text>
        </Pressable>
      </View>

      {/* 검색 결과 리스트 */}
      {results.length > 0 && (
        <View style={styles.resultList}>
          {results.slice(0, 6).map((r) => (
            <Pressable
              key={r.googlePlaceId}
              style={styles.resultItem}
              onPress={() => openSearchPlace(r)}
            >
              <Text style={styles.resultName}>{r.name}</Text>
              {r.address ? <Text style={styles.resultAddr}>{r.address}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      <PlaceDetailSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          sessionTokenRef.current = null
        }}
        userId={userId}
        searchPlace={sheetPlace}
        memoryId={sheetMemoryId}
        onSaved={handleSaved}
        onDeleted={(memoryId) => setSavedMarkers((prev) => prev.filter((m) => m.memoryId !== memoryId))}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photoMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#fff',
    overflow: 'hidden',
    backgroundColor: '#1a73e8',
  },
  savedDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  savedDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  photoMarkerImage: { width: '100%', height: '100%' },
  clusterBubble: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a73e8',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  clusterText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  searchWrapper: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    alignItems: 'flex-end',
    gap: 5,
  },
  searchBar: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '600' },
  myLocationBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLocationBtnText: {
    fontSize: 32,
    color: '#333',
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  resultList: {
    position: 'absolute',
    top: 155,
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultName: { fontSize: 15, fontWeight: '600', color: '#222' },
  resultAddr: { fontSize: 13, color: '#888', marginTop: 2 },
  errorBanner: {
    position: 'absolute',
    top: 104,
    left: 12,
    right: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  errorBannerText: { fontSize: 13, color: '#b91c1c', textAlign: 'center' },
})
