import { StyleSheet, Text, View } from 'react-native'

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text>프로필</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
