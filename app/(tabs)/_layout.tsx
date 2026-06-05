import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="map" options={{ title: '지도' }} />
      <Tabs.Screen name="feed" options={{ title: '피드' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  )
}
