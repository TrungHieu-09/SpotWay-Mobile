import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  AccountUser,
  Promotion,
  Store,
  StoreStatus,
  createPromotion,
  createStoreOwner,
  deletePromotion,
  deleteStoreOwner,
  getPromotions,
  getStoreOwners,
  getStores,
  resetStoreOwnerPassword,
  updatePromotion,
  updateStore,
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
  Tag,
  colors,
  confirmAction,
  errorText,
  showPassword,
  useLoad,
} from '../ui';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Building Manager: store owners ──
export function StoreOwnersTab() {
  const owners = useLoad(getStoreOwners);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!EMAIL.test(email.trim())) return Alert.alert('Email không hợp lệ', 'Vui lòng nhập đúng định dạng email.');
    setSaving(true);
    try {
      const created = await createStoreOwner({ email: email.trim(), name: name.trim() || undefined });
      setOpen(false);
      setEmail('');
      setName('');
      showPassword('Đã tạo chủ gian hàng', created.email, created.temporaryPassword);
      await owners.reload();
    } catch (e) {
      Alert.alert('Không tạo được tài khoản', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function reset(u: AccountUser) {
    try {
      const result = await resetStoreOwnerPassword(u.id);
      showPassword('Đã đặt lại mật khẩu', u.email, result.temporaryPassword ?? '');
    } catch (e) {
      Alert.alert('Không đặt lại được mật khẩu', errorText(e));
    }
  }

  async function remove(u: AccountUser) {
    try {
      await deleteStoreOwner(u.id);
      await owners.reload();
    } catch (e) {
      Alert.alert('Không xóa được tài khoản', errorText(e));
    }
  }

  const list = owners.data ?? [];
  return (
    <>
      <SectionTitle action={<Btn small icon="person-add" label="Thêm chủ gian hàng" onPress={() => setOpen(true)} />}>
        {`Chủ gian hàng (${list.length})`}
      </SectionTitle>
      <LoadState loading={owners.loading} error={owners.error} onRetry={owners.reload}>
        {list.length === 0 ? (
          <Empty text="Chưa có chủ gian hàng nào." />
        ) : (
          list.map((u) => (
            <Card key={u.id}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{u.email}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{u.storeCount ?? 0} gian hàng</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn small variant="ghost" icon="vpn-key" label="Đặt lại mật khẩu" onPress={() => confirmAction('Đặt lại mật khẩu?', u.email, 'Đặt lại', () => void reset(u))} />
                <Btn small variant="danger" icon="delete" label="Xóa" onPress={() => confirmAction('Xóa tài khoản?', u.email, 'Xóa', () => void remove(u))} />
              </View>
            </Card>
          ))
        )}
      </LoadState>

      <Sheet title="Thêm chủ gian hàng" visible={open} onClose={() => setOpen(false)}>
        <Field label="Email đăng nhập" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Tên hiển thị (tùy chọn)" value={name} onChangeText={setName} autoCapitalize="words" />
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Mật khẩu tạm sẽ hiển thị một lần sau khi tạo.</Text>
        <Btn label="Tạo tài khoản" icon="check" loading={saving} onPress={() => void create()} />
      </Sheet>
    </>
  );
}

// ── Store Owner: my stores ──
const STORE_STATUS: Record<StoreStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Đang mở', color: colors.green },
  PENDING: { label: 'Chờ duyệt', color: colors.amber },
  CLOSED: { label: 'Đã đóng', color: colors.red },
};

export function StoreInfoTab() {
  const stores = useLoad(getStores);
  const [editing, setEditing] = useState<Store | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<StoreStatus>('ACTIVE');
  const [saving, setSaving] = useState(false);

  function edit(store: Store) {
    setEditing(store);
    setName(store.name);
    setDescription(store.description ?? '');
    setStatus(store.status);
  }

  async function save() {
    if (!editing) return;
    if (!name.trim()) return Alert.alert('Thiếu tên gian hàng', 'Vui lòng nhập tên gian hàng.');
    setSaving(true);
    try {
      await updateStore(editing.id, { name: name.trim(), description: description.trim(), status });
      setEditing(null);
      await stores.reload();
    } catch (e) {
      Alert.alert('Không lưu được gian hàng', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const list = stores.data ?? [];
  return (
    <>
      <SectionTitle>{`Gian hàng của tôi (${list.length})`}</SectionTitle>
      <LoadState loading={stores.loading} error={stores.error} onRetry={stores.reload}>
        {list.length === 0 ? (
          <Empty text="Bạn chưa được gán gian hàng nào. Hãy liên hệ chủ tòa nhà hoặc quản lý." />
        ) : (
          list.map((store) => (
            <Card key={store.id}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{store.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{store.description || 'Chưa có mô tả'}</Text>
              <View style={{ marginTop: 8 }}>
                <Tag label={STORE_STATUS[store.status].label} color={STORE_STATUS[store.status].color} />
              </View>
              <View style={{ marginTop: 12 }}>
                <Btn small variant="ghost" icon="edit" label="Sửa thông tin" onPress={() => edit(store)} />
              </View>
            </Card>
          ))
        )}
      </LoadState>

      <Sheet title="Sửa gian hàng" visible={Boolean(editing)} onClose={() => setEditing(null)}>
        <Field label="Tên gian hàng" value={name} onChangeText={setName} autoCapitalize="sentences" />
        <Field label="Mô tả" value={description} onChangeText={setDescription} autoCapitalize="sentences" multiline />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Trạng thái</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {(Object.keys(STORE_STATUS) as StoreStatus[]).map((st) => (
            <Chip key={st} label={STORE_STATUS[st].label} color={STORE_STATUS[st].color} selected={status === st} onPress={() => setStatus(st)} />
          ))}
        </View>
        <Btn label="Lưu thay đổi" icon="check" loading={saving} onPress={() => void save()} />
      </Sheet>
    </>
  );
}

// ── Store Owner: promotions ──
const toDay = (iso: string) => iso.slice(0, 10);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function PromotionsTab() {
  const stores = useLoad(getStores);
  const [storeId, setStoreId] = useState<string>('');
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDay, setStartDay] = useState('');
  const [endDay, setEndDay] = useState('');
  const [status, setStatus] = useState<Promotion['status']>('ACTIVE');
  const [saving, setSaving] = useState(false);

  const storeList = stores.data ?? [];

  useEffect(() => {
    if (!storeId && storeList[0]) setStoreId(storeList[0].id);
  }, [storeList, storeId]);

  async function loadPromotions(id: string) {
    setLoading(true);
    setError(null);
    try {
      setItems(await getPromotions(id));
    } catch (e) {
      setItems([]);
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (storeId) void loadPromotions(storeId);
  }, [storeId]);

  function openForm(promotion: Promotion | 'new') {
    setEditing(promotion);
    if (promotion === 'new') {
      const today = new Date();
      const week = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      setTitle('');
      setDescription('');
      setStartDay(toDay(today.toISOString()));
      setEndDay(toDay(week.toISOString()));
      setStatus('ACTIVE');
    } else {
      setTitle(promotion.title);
      setDescription(promotion.description ?? '');
      setStartDay(toDay(promotion.startAt));
      setEndDay(toDay(promotion.endAt));
      setStatus(promotion.status);
    }
  }

  async function save() {
    if (!storeId || !editing) return;
    if (!title.trim()) return Alert.alert('Thiếu tiêu đề', 'Vui lòng nhập tiêu đề khuyến mãi.');
    if (!DAY.test(startDay) || !DAY.test(endDay)) return Alert.alert('Ngày không hợp lệ', 'Nhập ngày theo dạng YYYY-MM-DD, ví dụ 2026-12-01.');
    const startAt = new Date(`${startDay}T00:00:00`).toISOString();
    const endAt = new Date(`${endDay}T23:59:59`).toISOString();
    if (new Date(endAt) <= new Date(startAt)) return Alert.alert('Thời gian không hợp lệ', 'Ngày kết thúc phải sau ngày bắt đầu.');
    const payload = { title: title.trim(), description: description.trim(), startAt, endAt, status };
    setSaving(true);
    try {
      if (editing === 'new') await createPromotion(storeId, payload);
      else await updatePromotion(editing.id, payload);
      setEditing(null);
      await loadPromotions(storeId);
    } catch (e) {
      Alert.alert('Không lưu được khuyến mãi', errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Promotion) {
    try {
      await deletePromotion(p.id);
      await loadPromotions(storeId);
    } catch (e) {
      Alert.alert('Không xóa được khuyến mãi', errorText(e));
    }
  }

  return (
    <LoadState loading={stores.loading} error={stores.error} onRetry={stores.reload}>
      {storeList.length === 0 ? (
        <Empty text="Bạn chưa được gán gian hàng nào." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {storeList.map((st) => (
              <Chip key={st.id} label={st.name} selected={storeId === st.id} onPress={() => setStoreId(st.id)} />
            ))}
          </View>
          <SectionTitle action={<Btn small icon="add" label="Thêm khuyến mãi" onPress={() => openForm('new')} />}>
            {`Khuyến mãi (${items.length})`}
          </SectionTitle>
          <LoadState loading={loading} error={error} onRetry={() => void loadPromotions(storeId)}>
            {items.length === 0 ? (
              <Empty text="Chưa có khuyến mãi cho gian hàng này." />
            ) : (
              items.map((p) => (
                <Card key={p.id}>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{p.title}</Text>
                  {p.description ? <Text style={{ color: colors.muted, marginTop: 2 }}>{p.description}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <Tag label={p.status === 'ACTIVE' ? 'Đang đăng' : 'Tạm ẩn'} color={p.status === 'ACTIVE' ? colors.green : colors.amber} />
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {formatDate(p.startAt)} – {formatDate(p.endAt)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Btn small variant="ghost" icon="edit" label="Sửa" onPress={() => openForm(p)} />
                    <Btn small variant="danger" icon="delete" label="Xóa" onPress={() => confirmAction('Xóa khuyến mãi?', p.title, 'Xóa', () => void remove(p))} />
                  </View>
                </Card>
              ))
            )}
          </LoadState>
        </>
      )}

      <Sheet title={editing === 'new' ? 'Thêm khuyến mãi' : 'Sửa khuyến mãi'} visible={Boolean(editing)} onClose={() => setEditing(null)}>
        <Field label="Tiêu đề" value={title} onChangeText={setTitle} autoCapitalize="sentences" />
        <Field label="Mô tả" value={description} onChangeText={setDescription} autoCapitalize="sentences" multiline />
        <Field label="Bắt đầu (YYYY-MM-DD)" value={startDay} onChangeText={setStartDay} keyboardType="numbers-and-punctuation" />
        <Field label="Kết thúc (YYYY-MM-DD)" value={endDay} onChangeText={setEndDay} keyboardType="numbers-and-punctuation" />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Trạng thái</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          <Chip label="Đang đăng" color={colors.green} selected={status === 'ACTIVE'} onPress={() => setStatus('ACTIVE')} />
          <Chip label="Tạm ẩn" color={colors.amber} selected={status === 'INACTIVE'} onPress={() => setStatus('INACTIVE')} />
        </View>
        <Btn label="Lưu khuyến mãi" icon="check" loading={saving} onPress={() => void save()} />
      </Sheet>
    </LoadState>
  );
}
