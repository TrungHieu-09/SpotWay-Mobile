import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { changePassword, updateProfile } from '../api';
import type { MobileAuthUser } from './LoginScreen';
import { Btn, Card, Field, SectionTitle, Tag, colors, errorText, roleColor, roleName } from '../ui';

type Props = {
  user: MobileAuthUser;
  onUpdateUser: (updated: MobileAuthUser) => void;
  onLogout: () => void;
};

export function ProfileScreen({ user, onUpdateUser, onLogout }: Props) {
  const [name, setName] = useState(user.name);
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert('Thiếu tên', 'Tên hiển thị không được để trống.');
    setSavingName(true);
    try {
      const updated = await updateProfile(trimmed);
      onUpdateUser({ ...user, name: updated.name ?? trimmed });
      Alert.alert('Đã lưu', 'Đã cập nhật tên hiển thị.');
    } catch (e) {
      Alert.alert('Không lưu được tên', errorText(e));
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword() {
    if (!currentPassword) return Alert.alert('Thiếu mật khẩu hiện tại', 'Vui lòng nhập mật khẩu hiện tại.');
    if (newPassword.length < 8) return Alert.alert('Mật khẩu chưa hợp lệ', 'Mật khẩu mới cần tối thiểu 8 ký tự.');
    if (newPassword !== confirmPassword) return Alert.alert('Không khớp', 'Xác nhận mật khẩu mới không trùng khớp.');
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Đã đổi mật khẩu', 'Lần đăng nhập sau hãy dùng mật khẩu mới.');
    } catch (e) {
      Alert.alert('Không đổi được mật khẩu', errorText(e));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <Card>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{user.name}</Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>{user.email}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <Tag label={roleName[user.role] ?? user.role} color={roleColor[user.role] ?? colors.muted} />
          {user.tenantName ? <Text style={{ color: colors.muted, fontSize: 12 }}>{user.tenantName}</Text> : null}
        </View>
      </Card>

      <SectionTitle>Tên hiển thị</SectionTitle>
      <Card>
        <Field label="Tên" value={name} onChangeText={setName} autoCapitalize="words" />
        <Btn label="Lưu tên" icon="check" loading={savingName} onPress={() => void saveName()} />
      </Card>

      <SectionTitle>Đổi mật khẩu</SectionTitle>
      <Card>
        <Field label="Mật khẩu hiện tại" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
        <Field label="Mật khẩu mới (tối thiểu 8 ký tự)" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
        <Field label="Nhập lại mật khẩu mới" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        <Btn label="Đổi mật khẩu" icon="lock" loading={savingPassword} onPress={() => void savePassword()} />
      </Card>

      <View style={{ marginTop: 6 }}>
        <Btn variant="danger" icon="logout" label="Đăng xuất" onPress={onLogout} />
      </View>
    </>
  );
}
