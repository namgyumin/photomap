import { Image } from 'react-native'
import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: '지도',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Image
              source={require('../../assets/icons/tab-map.png')}
              style={{ width: size, height: size, tintColor: color }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="memories"
        options={{
          title: '기록',
          tabBarIcon: ({ color, size }) => (
            <Image
              source={require('../../assets/icons/tab-memories.png')}
              style={{ width: size, height: size, tintColor: color }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '프로필',
          tabBarIcon: ({ color, size }) => (
            <Image
              source={require('../../assets/icons/tab-profile.png')}
              style={{ width: size, height: size, tintColor: color }}
            />
          ),
        }}
      />
    </Tabs>
  )
}
