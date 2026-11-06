import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { setSession } from '../api';
import type { MobileAuthUser } from './LoginScreen';
import { AdminAccountsTab, AdminOverviewTab } from './AdminTabs';
import { OwnerBuildingsTab, OwnerOverviewTab, OwnerStaffTab } from './OwnerTabs';
import { PromotionsTab, StoreInfoTab, StoreOwnersTab } from './StoreTabs';
import { ProfileScreen } from './ProfileScreen';
import { Tag, colors, roleColor, roleName } from '../ui';

type TabId = 'overview' | 'accounts' | 'buildings' | 'staff' | 'storeOwners' | 'stores' | 'promotions' | 'profile';

type TabDef = { id: TabId; label: string; icon: keyof typeof MaterialIcons.glyphMap };

/** Same menus as the web app for each role (map editor and 3D views stay on the web). */
const TABS: Record<string, TabDef[]> = {
  admin: [
    { id: 'overview', label: 'Tổng quan', icon: 'dashboard' },
    { id: 'accounts', label: 'Tài khoản', icon: 'group' },
    { id: 'profile', label: 'Hồ sơ', icon: 'person' },
  ],
  building_owner: [
    { id: 'overview', label: 'Tổng quan', icon: 'dashboard' },
    { id: 'buildings', label: 'Tòa nhà', icon: 'apartment' },
    { id: 'staff', label: 'Nhân sự', icon: 'groups' },
    { id: 'profile', label: 'Hồ sơ', icon: 'person' },
  ],
  building_manager: [
    { id: 'buildings', label: 'Tòa nhà', icon: 'apartment' },
    { id: 'storeOwners', label: 'Chủ gian hàng', icon: 'storefront' },
    { id: 'profile', label: 'Hồ sơ', icon: 'person' },
  ],
  store_owner: [
    { id: 'stores', label: 'Gian hàng', icon: 'store' },
    { id: 'promotions', label: 'Khuyến mãi', icon: 'local-offer' },
    { id: 'profile', label: 'Hồ sơ', icon: 'person' },
  ],
};

interface Props {
  user: MobileAuthUser;
  onUpdateUser: (updated: MobileAuthUser) => void;
  onOpenLanding: () => void;
  onLogout: () => void;
}

export function WorkspaceHubScreen({ user, onUpdateUser, onOpenLanding, onLogout }: Props) {
  const tabs = TABS[user.role] ?? [{ id: 'profile' as TabId, label: 'Hồ sơ', icon: 'person' as const }];
  const [active, setActive] = useState<TabId>(tabs[0].id);
  const expiredShown = useRef(false);

  // Registered during the first render so the tabs' initial requests already carry the token.
  useState(() => {
    setSession(user.accessToken ?? null, () => {
      if (expiredShown.current) return;
      expiredShown.current = true;
      Alert.alert('Phiên đăng nhập đã hết hạn', 'Vui lòng đăng nhập lại.');
      onLogout();
    });
    return true;
  });

  const logout = () => {
    setSession(null);
    onLogout();
  };

  const content = useMemo(() => {
    switch (active) {
      case 'overview':
        return user.role === 'admin' ? <AdminOverviewTab /> : <OwnerOverviewTab onOpenBuildings={() => setActive('buildings')} />;
      case 'accounts':
        return <AdminAccountsTab currentUserId={user.id} />;
      case 'buildings':
        return <OwnerBuildingsTab readOnly={user.role !== 'building_owner'} />;
      case 'staff':
        return <OwnerStaffTab />;
      case 'storeOwners':
        return <StoreOwnersTab />;
      case 'stores':
        return <StoreInfoTab />;
      case 'promotions':
        return <PromotionsTab />;
      default:
        return <ProfileScreen user={user} onUpdateUser={onUpdateUser} onLogout={logout} />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>SpotWay</Text>
          <View style={styles.headerSub}>
            <Tag label={roleName[user.role] ?? user.role} color={roleColor[user.role] ?? colors.muted} />
            {user.tenantName ? <Text style={styles.tenant}>{user.tenantName}</Text> : null}
          </View>
        </View>
        <TouchableOpacity onPress={onOpenLanding} hitSlop={10} style={styles.iconBtn}>
          <MaterialIcons name="home" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <TouchableOpacity key={tab.id} style={styles.tab} activeOpacity={0.8} onPress={() => setActive(tab.id)}>
              <MaterialIcons name={tab.icon} size={22} color={selected ? colors.violet : colors.muted} />
              <Text style={[styles.tabLabel, selected && { color: colors.violet }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { color: colors.text, fontSize: 20, fontWeight: '800' },
  headerSub: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tenant: { color: colors.muted, fontSize: 12 },
  iconBtn: { padding: 6 },
  body: { padding: 16, paddingBottom: 32 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.cardAlt, paddingBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, gap: 2 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
});
