import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: '지도', headerShown: false }} />
      <Tabs.Screen name="memories" options={{ title: '기록' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  )
}
