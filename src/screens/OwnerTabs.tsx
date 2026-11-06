import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  AccountUser,
  Building,
  assignManagerByEmail,
  createBuilding,
  createTenantUser,
  deleteBuilding,
  deleteTenantUser,
  getBuildings,
  getTenantOverview,
  getTenantUsers,
  resetTenantUserPassword,
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
  roleColor,
  roleName,
  showPassword,
  useLoad,
} from '../ui';

export function OwnerOverviewTab({ onOpenBuildings }: { onOpenBuildings: () => void }) {
  const overview = useLoad(getTenantOverview);
  const o = overview.data;

  return (
    <LoadState loading={overview.loading} error={overview.error} onRetry={overview.reload}>
      {o ? (
        <>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 }}>{o.tenant.name}</Text>
          <Text style={{ color: colors.muted, marginBottom: 12 }}>{o.tenant.subdomain}.spotway.app</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <Stat label="Tòa nhà" value={o.usage.buildings} color={colors.cyan} />
            <Stat label="Tầng đã xuất bản" value={`${o.usage.publishedFloors}/${o.usage.floors}`} color={colors.green} />
            <Stat label="Quản lý" value={o.usage.managers} color={colors.violet} />
            <Stat label="Chủ gian hàng" value={o.usage.storeOwners} color={colors.amber} />
            <Stat label="Gian hàng" value={o.usage.stores} />
            <Stat label="Khuyến mãi đang chạy" value={o.usage.activePromotions} color={colors.pink} />
          </View>
          <Btn variant="ghost" icon="apartment" label="Xem danh sách tòa nhà" onPress={onOpenBuildings} />
        </>
      ) : null}
    </LoadState>
  );
}

/** `readOnly` is for managers: they see their buildings but only an owner can add, assign or delete. */
export function OwnerBuildingsTab({ readOnly = false }: { readOnly?: boolean }) {
  const buildings = useLoad(getBuildings);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Building | null>(null);
  const [managerEmail, setManagerEmail] = useState('');

  async function create() {
    if (!name.trim()) return Alert.alert('Thiếu tên tòa nhà', 'Vui lòng nhập tên tòa nhà.');
    setSaving(true);
    try {
      await createBuilding({ name: name.trim(), address: address.trim() || undefined });
      setCreateOpen(false);
      setName('');
      setAddress('');
      await buildings.reload();
    } catch (e) {
      Alert.alert('Không tạo được tòa nhà', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(b: Building) {
    try {
      await deleteBuilding(b.id);
      await buildings.reload();
    } catch (e) {
      Alert.alert('Không xóa được tòa nhà', errorText(e));
    }
  }

  async function assign() {
    if (!assignTarget) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail.trim())) return Alert.alert('Email không hợp lệ', 'Nhập email của quản lý đã có tài khoản.');
    setSaving(true);
    try {
      await assignManagerByEmail(assignTarget.id, managerEmail.trim());
      Alert.alert('Đã gán quản lý', `${managerEmail.trim()} quản lý ${assignTarget.name}.`);
      setAssignTarget(null);
      setManagerEmail('');
    } catch (e) {
      Alert.alert('Không gán được quản lý', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const list = buildings.data ?? [];

  return (
    <>
      <SectionTitle action={readOnly ? undefined : <Btn small icon="add" label="Thêm tòa nhà" onPress={() => setCreateOpen(true)} />}>
        {`Tòa nhà (${list.length})`}
      </SectionTitle>
      <LoadState loading={buildings.loading} error={buildings.error} onRetry={buildings.reload}>
        {list.length === 0 ? (
          <Empty text="Chưa có tòa nhà nào." />
        ) : (
          list.map((b) => (
            <Card key={b.id}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{b.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{b.address || 'Chưa có địa chỉ'}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Tag label={b.status === 'ACTIVE' ? 'Đang hoạt động' : 'Bản nháp'} color={b.status === 'ACTIVE' ? colors.green : colors.amber} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>{b.floorCount} tầng</Text>
              </View>
              {readOnly ? null : <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn small variant="ghost" icon="person-add" label="Gán quản lý" onPress={() => setAssignTarget(b)} />
                <Btn small variant="danger" icon="delete" label="Xóa" onPress={() => confirmAction('Xóa tòa nhà?', b.name, 'Xóa', () => void remove(b))} />
              </View>}
            </Card>
          ))
        )}
      </LoadState>

      <Sheet title="Thêm tòa nhà" visible={createOpen} onClose={() => setCreateOpen(false)}>
        <Field label="Tên tòa nhà" value={name} onChangeText={setName} autoCapitalize="sentences" />
        <Field label="Địa chỉ" value={address} onChangeText={setAddress} autoCapitalize="sentences" />
        <Btn label="Tạo tòa nhà" icon="check" loading={saving} onPress={() => void create()} />
      </Sheet>

      <Sheet title={assignTarget ? `Gán quản lý · ${assignTarget.name}` : ''} visible={Boolean(assignTarget)} onClose={() => setAssignTarget(null)}>
        <Field label="Email quản lý (đã có tài khoản)" value={managerEmail} onChangeText={setManagerEmail} keyboardType="email-address" />
        <Btn label="Gán quản lý" icon="check" loading={saving} onPress={() => void assign()} />
      </Sheet>
    </>
  );
}

type StaffRole = 'building_manager' | 'store_owner';

export function OwnerStaffTab() {
  const users = useLoad(getTenantUsers);
  const buildings = useLoad(getBuildings);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('building_manager');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const staff = (users.data ?? []).filter((u) => u.role === 'building_manager' || u.role === 'store_owner');

  function toggleArea(id: string) {
    setAreaIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function create() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Alert.alert('Email không hợp lệ', 'Vui lòng nhập đúng định dạng email.');
    setSaving(true);
    try {
      const created = await createTenantUser({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        areaIds: role === 'building_manager' ? areaIds : undefined,
      });
      setOpen(false);
      setEmail('');
      setName('');
      setAreaIds([]);
      showPassword('Đã tạo tài khoản', created.email, created.temporaryPassword);
      await users.reload();
    } catch (e) {
      Alert.alert('Không tạo được tài khoản', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset(u: AccountUser) {
    try {
      const result = await resetTenantUserPassword(u.id);
      showPassword('Đã đặt lại mật khẩu', u.email, result.temporaryPassword ?? '');
    } catch (e) {
      Alert.alert('Không đặt lại được mật khẩu', errorText(e));
    }
  }

  async function remove(u: AccountUser) {
    try {
      await deleteTenantUser(u.id);
      await users.reload();
    } catch (e) {
      Alert.alert('Không xóa được tài khoản', errorText(e));
    }
  }

  return (
    <>
      <SectionTitle action={<Btn small icon="person-add" label="Thêm nhân sự" onPress={() => setOpen(true)} />}>
        {`Quản lý & chủ gian hàng (${staff.length})`}
      </SectionTitle>
      <LoadState loading={users.loading} error={users.error} onRetry={users.reload}>
        {staff.length === 0 ? (
          <Empty text="Chưa có tài khoản nào." />
        ) : (
          staff.map((u) => (
            <Card key={u.id}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{u.email}</Text>
              <View style={{ marginTop: 6 }}>
                <Tag label={roleName[u.role]} color={roleColor[u.role]} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn small variant="ghost" icon="vpn-key" label="Đặt lại mật khẩu" onPress={() => confirmAction('Đặt lại mật khẩu?', u.email, 'Đặt lại', () => void reset(u))} />
                <Btn small variant="danger" icon="delete" label="Xóa" onPress={() => confirmAction('Xóa tài khoản?', u.email, 'Xóa', () => void remove(u))} />
              </View>
            </Card>
          ))
        )}
      </LoadState>

      <Sheet title="Thêm nhân sự" visible={open} onClose={() => setOpen(false)}>
        <Field label="Email đăng nhập" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Tên hiển thị (tùy chọn)" value={name} onChangeText={setName} autoCapitalize="words" />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Vai trò</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={roleName.building_manager} color={roleColor.building_manager} selected={role === 'building_manager'} onPress={() => setRole('building_manager')} />
          <Chip label={roleName.store_owner} color={roleColor.store_owner} selected={role === 'store_owner'} onPress={() => setRole('store_owner')} />
        </View>
        {role === 'building_manager' ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginVertical: 6 }}>Tòa nhà phụ trách</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {(buildings.data ?? []).map((b) => (
                <Chip key={b.id} label={b.name} selected={areaIds.includes(b.id)} onPress={() => toggleArea(b.id)} />
              ))}
            </View>
          </>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 12, marginVertical: 10 }}>Mật khẩu tạm sẽ hiển thị một lần sau khi tạo.</Text>
        <Btn label="Tạo tài khoản" icon="check" loading={saving} onPress={() => void create()} />
      </Sheet>
    </>
  );
}
