import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export const colors = {
  bg: '#121221',
  card: '#1e1e2e',
  cardAlt: '#0d0d1c',
  border: 'rgba(73, 68, 84, 0.5)',
  text: '#e3e0f7',
  muted: '#958ea0',
  violet: '#a078ff',
  cyan: '#5de6ff',
  green: '#34d399',
  amber: '#fbbf24',
  pink: '#f8acff',
  red: '#f87171',
};

export const roleColor: Record<string, string> = {
  admin: colors.pink,
  building_owner: colors.green,
  building_manager: colors.violet,
  store_owner: colors.amber,
};

export const roleName: Record<string, string> = {
  admin: 'Quản trị viên',
  building_owner: 'Chủ tòa nhà',
  building_manager: 'Quản lý tòa nhà',
  store_owner: 'Chủ gian hàng',
};

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Đã có lỗi xảy ra.';
}

/** Loads data once and exposes `reload`; shows nothing fake while loading or after an error. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export function confirmAction(title: string, message: string, confirmLabel: string, run: () => void) {
  Alert.alert(title, message, [
    { text: 'Hủy', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: run },
  ]);
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Stat({ label, value, color = colors.text }: { label: string; value: number | string; color?: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: keyof typeof MaterialIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
};

export function Btn({ label, onPress, variant = 'primary', icon, loading, disabled, small }: BtnProps) {
  const tone = variant === 'primary' ? colors.violet : variant === 'danger' ? colors.red : colors.muted;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        s.btn,
        small && s.btnSmall,
        variant === 'primary' ? { backgroundColor: colors.violet } : { borderWidth: 1, borderColor: tone },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#1b1033' : tone} />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={small ? 14 : 16} color={variant === 'primary' ? '#1b1033' : tone} /> : null}
          <Text style={[s.btnText, small && { fontSize: 12 }, { color: variant === 'primary' ? '#1b1033' : tone }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#6b657a"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[s.input, props.multiline && { height: 84, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, color = colors.violet }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.chip, selected && { backgroundColor: color + '33', borderColor: color }]}
    >
      <Text style={[s.chipText, selected && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.tag, { backgroundColor: color + '26', borderColor: color + '66' }]}>
      <Text style={[s.tagText, { color }]}>{label}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}

/** Renders loading / error / content for a `useLoad` result. */
export function LoadState({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: React.ReactNode }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.violet} />;
  if (error) {
    return (
      <Card>
        <Text style={{ color: colors.red, marginBottom: 12 }}>{error}</Text>
        <Btn label="Thử lại" variant="ghost" icon="refresh" onPress={onRetry} />
      </Card>
    );
  }
  return <>{children}</>;
}

export function Sheet({ title, visible, onClose, children }: { title: string; visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialIcons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Shows a one-time password (temporary or just created) so the admin can pass it on. */
export function showPassword(title: string, email: string, password: string) {
  Alert.alert(title, `${email}\n\nMật khẩu: ${password}\n\nHãy gửi mật khẩu này cho người dùng; app không lưu lại.`);
}

export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `${out}!9`;
}

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  stat: { flex: 1, minWidth: '45%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 10 },
  btnText: { fontSize: 14, fontWeight: '700' },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: colors.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  chip: { borderRadius: 99, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tag: { borderRadius: 99, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  tagText: { fontSize: 11, fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 28 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '88%', borderWidth: 1, borderColor: colors.border },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
});
