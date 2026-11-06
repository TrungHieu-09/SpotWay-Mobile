import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  AccountUser,
  Role,
  createAdminUser,
  deleteAdminUser,
  getAdminOverview,
  getAdminUsers,
  resetAdminUserPassword,
} from '../api';
import {
  Btn,
  Card,
  Chip,
  Empty,
  Field,
  LoadState,
  SectionTitle,
  Sheet,
  Stat,
  Tag,
  colors,
  confirmAction,
  errorText,
  generatePassword,
  roleColor,
  roleName,
  showPassword,
  useLoad,
} from '../ui';
import { Alert } from 'react-native';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

export function AdminOverviewTab() {
  const overview = useLoad(getAdminOverview);
  const users = useLoad(getAdminUsers);
  const o = overview.data;

  return (
    <LoadState
      loading={overview.loading || users.loading}
      error={overview.error ?? users.error}
      onRetry={() => {
        void overview.reload();
        void users.reload();
      }}
    >
      {o ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <Stat label="Tài khoản" value={o.users.total} />
            <Stat label="Tòa nhà" value={o.buildings} color={colors.cyan} />
            <Stat label="Chủ tòa nhà" value={o.users.buildingOwner} color={colors.green} />
            <Stat label="Quản lý tòa nhà" value={o.users.buildingManager} color={colors.violet} />
            <Stat label="Chủ gian hàng" value={o.users.storeOwner} color={colors.amber} />
            <Stat label="Quản trị viên" value={o.users.admin} color={colors.pink} />
          </View>
          <SectionTitle>Tài khoản mới tạo</SectionTitle>
          {(users.data ?? []).slice(0, 5).map((u) => (
            <Card key={u.id}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{u.email}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                <Tag label={roleName[u.role] ?? u.role} color={roleColor[u.role] ?? colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>{formatDate(u.createdAt)}</Text>
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </LoadState>
  );
}

type CreateRole = Exclude<Role, 'admin'>;
const CREATE_ROLES: CreateRole[] = ['building_owner', 'building_manager', 'store_owner'];

export function AdminAccountsTab({ currentUserId }: { currentUserId: string }) {
  const users = useLoad(getAdminUsers);
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreateRole>('building_owner');
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);

  const list = users.data ?? [];
  const owners = useMemo(() => list.filter((u) => u.role === 'building_owner'), [list]);
  const needsOwner = role !== 'building_owner';

  const visible = list.filter(
    (u) => (roleFilter === 'all' || u.role === roleFilter) && u.email.toLowerCase().includes(keyword.trim().toLowerCase()),
  );

  function openCreate() {
    setEmail('');
    setPassword('');
    setRole('building_owner');
    setOwnerId(owners[0]?.id ?? '');
    setSheetOpen(true);
  }

  async function submit() {
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return Alert.alert('Email không hợp lệ', 'Vui lòng nhập đúng định dạng email.');
    if (password.length < 8 || password.length > 72) return Alert.alert('Mật khẩu chưa hợp lệ', 'Mật khẩu cần từ 8 đến 72 ký tự.');
    if (needsOwner && !ownerId) return Alert.alert('Thiếu chủ tòa nhà', 'Hãy chọn chủ tòa nhà mà tài khoản này thuộc về.');
    setSaving(true);
    try {
      await createAdminUser({ email: cleanEmail, password, role, ownerId: needsOwner ? ownerId : undefined });
      setSheetOpen(false);
      Alert.alert('Đã tạo tài khoản', `${cleanEmail} (${roleName[role]})`);
      await users.reload();
    } catch (e) {
      Alert.alert('Không tạo được tài khoản', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(u: AccountUser) {
    try {
      const result = await resetAdminUserPassword(u.id);
      showPassword('Đã đặt lại mật khẩu', u.email, result.temporaryPassword ?? '');
    } catch (e) {
      Alert.alert('Không đặt lại được mật khẩu', errorText(e));
    }
  }

  async function remove(u: AccountUser) {
    try {
      await deleteAdminUser(u.id);
      await users.reload();
    } catch (e) {
      Alert.alert('Không xóa được tài khoản', errorText(e));
    }
  }

  return (
    <>
      <SectionTitle action={<Btn small icon="person-add" label="Tạo tài khoản" onPress={openCreate} />}>
        {`Tài khoản (${list.length})`}
      </SectionTitle>
      <Field label="Tìm theo email" value={keyword} onChangeText={setKeyword} placeholder="name@company.com" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Chip label="Tất cả" selected={roleFilter === 'all'} onPress={() => setRoleFilter('all')} />
        {(['admin', ...CREATE_ROLES] as Role[]).map((r) => (
          <Chip key={r} label={roleName[r]} color={roleColor[r]} selected={roleFilter === r} onPress={() => setRoleFilter(r)} />
        ))}
      </View>

      <LoadState loading={users.loading} error={users.error} onRetry={users.reload}>
        {visible.length === 0 ? (
          <Empty text="Không có tài khoản phù hợp." />
        ) : (
          visible.map((u) => (
            <Card key={u.id}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{u.email}</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                <Tag label={roleName[u.role] ?? u.role} color={roleColor[u.role] ?? colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {u.role === 'admin' ? 'Toàn hệ thống' : u.role === 'building_owner' ? 'Chính họ' : (u.tenantName ?? '—')}
                  {' · '}
                  {formatDate(u.createdAt)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn small variant="ghost" icon="vpn-key" label="Đặt lại mật khẩu" onPress={() => confirmAction('Đặt lại mật khẩu?', u.email, 'Đặt lại', () => void resetPassword(u))} />
                <Btn small variant="danger" icon="delete" label="Xóa" disabled={u.id === currentUserId} onPress={() => confirmAction('Xóa tài khoản?', u.email, 'Xóa', () => void remove(u))} />
              </View>
            </Card>
          ))
        )}
      </LoadState>

      <Sheet title="Tạo tài khoản mới" visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Field label="Email đăng nhập" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="name@company.com" />
        <Field label="Mật khẩu khởi tạo (8–72 ký tự)" value={password} onChangeText={setPassword} placeholder="Mật khẩu" />
        <View style={{ marginBottom: 12 }}>
          <Btn small variant="ghost" icon="casino" label="Tạo ngẫu nhiên" onPress={() => setPassword(generatePassword())} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Vai trò</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {CREATE_ROLES.map((r) => (
            <Chip key={r} label={roleName[r]} color={roleColor[r]} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </View>
        {needsOwner ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginVertical: 6 }}>Thuộc chủ tòa nhà</Text>
            {owners.length === 0 ? (
              <Text style={{ color: colors.amber }}>Chưa có chủ tòa nhà nào. Hãy tạo chủ tòa nhà trước.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {owners.map((o) => (
                  <Chip key={o.id} label={o.email} selected={ownerId === o.id} onPress={() => setOwnerId(o.id)} />
                ))}
              </View>
            )}
          </>
        ) : null}
        <View style={{ marginTop: 14 }}>
          <Btn label="Tạo tài khoản" icon="check" loading={saving} onPress={() => void submit()} />
        </View>
      </Sheet>
    </>
  );
}
