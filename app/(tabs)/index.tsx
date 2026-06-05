import { StyleSheet, Text, View } from 'react-native'

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>오늘 어디 갔어?</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
})
