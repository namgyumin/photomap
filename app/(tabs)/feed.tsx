import { StyleSheet, Text, View } from 'react-native'

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <Text>친구 피드</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
