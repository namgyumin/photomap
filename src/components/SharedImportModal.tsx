import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ImportMode } from '../types/database'

interface Props {
  visible: boolean
  onSelect: (mode: ImportMode) => void
  onCancel: () => void
}

// 가져오기 충돌 모달 (PRD v0.5)
// 버튼: 내 기록 유지 / 모든 데이터로 덮어쓰기 / 취소
export function SharedImportModal({ visible, onSelect, onCancel }: Props) {
  const { t } = useTranslation()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('import.alreadyHave')}</Text>
          <Text style={styles.body}>{t('import.body')}</Text>

          <Pressable
            style={[styles.btn, styles.keep]}
            onPress={() => onSelect('keep')}
          >
            <Text style={styles.keepText}>{t('import.keepMine')}</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.overwrite]}
            onPress={() => onSelect('overwrite')}
          >
            <Text style={styles.overwriteText}>{t('import.overwrite')}</Text>
          </Pressable>

          <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
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
