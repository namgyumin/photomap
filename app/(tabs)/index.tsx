import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PlaceDetailSheet } from '../../src/components/PlaceDetailSheet'
import { hasGoogleMapsKey } from '../../src/lib/config'
import { searchPlaces, type PlaceSearchResult } from '../../src/lib/googlePlaces'
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
}

export default function MapScreen() {
  const { userId } = useAuth()
  const router = useRouter()
  const params = useLocalSearchParams<{ openMemoryId?: string }>()
  const mapRef = useRef<MapView>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [savedMarkers, setSavedMarkers] = useState<SavedMarker[]>([])

  // 선택된 장소 (검색 결과) 또는 기존 메모리
  const [sheetPlace, setSheetPlace] = useState<PlaceSearchResult | null>(null)
  const [sheetMemoryId, setSheetMemoryId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // 리스트 탭에서 넘어온 메모리 열기
  useEffect(() => {
    if (params.openMemoryId) {
      setSheetMemoryId(params.openMemoryId)
      setSheetPlace(null)
      setSheetOpen(true)
      // param 소비
      router.setParams({ openMemoryId: undefined })
    }
  }, [params.openMemoryId, router])

  const handleSearch = useCallback(async () => {
    Keyboard.dismiss()
    if (!query.trim()) return
    if (!hasGoogleMapsKey) {
      Alert.alert(
        '검색 비활성화',
        'Google Maps API 키가 설정되지 않았어요. GOOGLE_MAPS_API_KEY 를 설정해주세요.'
      )
      return
    }
    setSearching(true)
    try {
      const res = await searchPlaces(query)
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
  }, [query])

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
    setSavedMarkers((prev) => {
      const without = prev.filter((m) => m.memoryId !== memoryId)
      return [...without, { memoryId, place }]
    })
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={SEOUL}
      >
        {savedMarkers.map((m) => (
          <Marker
            key={m.memoryId}
            coordinate={{ latitude: m.place.latitude, longitude: m.place.longitude }}
            title={m.place.name}
            pinColor="#1a73e8"
            onPress={() => openSavedMarker(m)}
          />
        ))}
        {results.map((r) => (
          <Marker
            key={r.googlePlaceId}
            coordinate={{ latitude: r.latitude, longitude: r.longitude }}
            title={r.name}
            description={r.address ?? undefined}
            onPress={() => openSearchPlace(r)}
          />
        ))}
      </MapView>

      {/* 검색바 */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="장소 검색"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={handleSearch}>
          {searching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>검색</Text>
          )}
        </Pressable>
      </View>

      {/* 검색 결과 리스트 */}
      {results.length > 0 && (
        <View style={styles.resultList}>
          {results.slice(0, 6).map((r) => (
            <Pressable key={r.googlePlaceId} style={styles.resultItem} onPress={() => openSearchPlace(r)}>
              <Text style={styles.resultName}>{r.name}</Text>
              {r.address ? <Text style={styles.resultAddr}>{r.address}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}

      <PlaceDetailSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        userId={userId}
        searchPlace={sheetPlace}
        memoryId={sheetMemoryId}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  searchBar: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
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
  resultList: {
    position: 'absolute',
    top: 104,
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
  resultItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  resultName: { fontSize: 15, fontWeight: '600', color: '#222' },
  resultAddr: { fontSize: 13, color: '#888', marginTop: 2 },
})
