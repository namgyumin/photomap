import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { ImportMode } from '../types/database'

interface Props {
  visible: boolean
  onSelect: (mode: ImportMode) => void
  onCancel: () => void
}

// 가져오기 충돌 모달 (PRD v0.5)
// 버튼: 내 기록 유지 / 모든 데이터로 덮어쓰기 / 취소
export function SharedImportModal({ visible, onSelect, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>이미 내 기록이 있어요</Text>
          <Text style={styles.body}>
            기본으로는 내 기록을 유지하고, 공유된 사진/영상만 뒤에 추가해요.{'\n\n'}
            공유된 데이터로 위치, 방문일, 메모, 쓴 금액, 대표 사진까지 모두 덮어씌울까요?
          </Text>

          <Pressable
            style={[styles.btn, styles.keep]}
            onPress={() => onSelect('keep')}
          >
            <Text style={styles.keepText}>내 기록 유지</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.overwrite]}
            onPress={() => onSelect('overwrite')}
          >
            <Text style={styles.overwriteText}>모든 데이터로 덮어쓰기</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  body: { fontSize: 14, color: '#444', lineHeight: 20, marginBottom: 20 },
  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  keep: { backgroundColor: '#1a73e8' },
  keepText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  overwrite: { backgroundColor: '#fce8e6' },
  overwriteText: { color: '#c5221f', fontWeight: '600', fontSize: 15 },
  cancel: { backgroundColor: '#f1f3f4' },
  cancelText: { color: '#444', fontWeight: '500', fontSize: 15 },
})
