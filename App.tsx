import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';

type LevelId = 'L1' | 'L2' | 'L3';
type Lang = 'VI' | 'EN';

interface LevelDetail {
  zone: string;
  targetTitle: string;
  walkInfo: string;
  roomTopLeft: { code: string; meta: string };
  roomTopRight: { code: string; meta: string };
  roomBottomLeft: string;
  roomBottomRight: string;
  beacons: string;
  latency: string;
  svgPath: string;
  waypointX: number;
  waypointY: number;
}

const LEVEL_DATA: Record<LevelId, LevelDetail> = {
  L1: {
    zone: 'Terminal 3 — Metro Arrivals',
    targetTitle: 'Gate 1.02',
    walkInfo: '3m walk (210m)',
    roomTopLeft: { code: 'GATE A04', meta: '68 pax' },
    roomTopRight: { code: 'METRO HUB', meta: 'Active' },
    roomBottomLeft: 'KIOSK 01',
    roomBottomRight: 'BAGGAGE',
    beacons: '28 Beacons Synced',
    latency: '14ms',
    svgPath: 'M 26 112 L 90 92 L 150 65 L 198 34',
    waypointX: 150,
    waypointY: 65,
  },
  L2: {
    zone: 'Terminal 3 — North Concourse',
    targetTitle: 'Room 3.12',
    walkInfo: '2m walk (140m)',
    roomTopLeft: { code: 'GATE B12', meta: '42 pax' },
    roomTopRight: { code: 'LOUNGE A', meta: 'Occupied' },
    roomBottomLeft: 'KIOSK',
    roomBottomRight: 'CHECK-IN',
    beacons: '32 Beacons Synced',
    latency: '18ms',
    svgPath: 'M 30 110 L 80 85 L 140 85 L 190 40',
    waypointX: 140,
    waypointY: 85,
  },
  L3: {
    zone: 'Terminal 3 — Executive Lounge',
    targetTitle: 'Sky Suite 3.08',
    walkInfo: '1m walk (90m)',
    roomTopLeft: { code: 'VIP SUITE', meta: '16 pax' },
    roomTopRight: { code: 'SKY DECK', meta: 'Open' },
    roomBottomLeft: 'LIFT CORE',
    roomBottomRight: 'CONCIERGE',
    beacons: '24 Beacons Synced',
    latency: '12ms',
    svgPath: 'M 34 106 L 95 75 L 145 75 L 192 38',
    waypointX: 145,
    waypointY: 75,
  },
};

const TRUSTED_HUBS: Array<{
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}> = [
  { name: 'HEATHROW T5', icon: 'flight-takeoff', color: '#a078ff' },
  { name: 'WESTFIELD', icon: 'storefront', color: '#f8acff' },
  { name: 'CHANGI SIN', icon: 'hub', color: '#5de6ff' },
  { name: 'MAYO CLINIC', icon: 'local-hospital', color: '#34d399' },
  { name: 'BROOKFIELD', icon: 'domain', color: '#a078ff' },
  { name: 'HUDSON YARDS', icon: 'apartment', color: '#5de6ff' },
];

const BENTO_FEATURES: Array<{
  icon: keyof typeof MaterialIcons.glyphMap;
  accent: 'violet' | 'cyan' | 'fuchsia';
  tagVi: string;
  tagEn: string;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
  metrics?: Array<{ label: string; value: string; color: string }>;
}> = [
  {
    icon: 'layers',
    accent: 'violet',
    tagVi: 'BẢN ĐỒ KHÔNG GIAN 3D',
    tagEn: 'SPATIAL CORE ENGINE',
    titleVi: 'Bản đồ 3D đa tầng tương tác',
    titleEn: 'Multi-Floor 3D Interactive Maps',
    descVi:
      'Kết xuất mượt mà với WebGL/Three.js, chuyển tầng tức thì, xoay 360° và hiển thị nhãn POI thông minh ở tốc độ 60 FPS.',
    descEn:
      'Smooth WebGL/Three.js rendering with instant floor-switching, 360° orbital camera controls, and dynamic POI occlusion at 60fps.',
    metrics: [
      { label: 'FPS', value: '60', color: '#5de6ff' },
      { label: 'LOAD', value: '< 40ms', color: '#d0bcff' },
      { label: 'MESH', value: 'LOD v3', color: '#f8acff' },
    ],
  },
  {
    icon: 'qr-code-scanner',
    accent: 'cyan',
    tagVi: 'ĐỊNH VỊ KHÔNG CẦN CÀI APP',
    tagEn: 'ZERO-INSTALL POSITIONING',
    titleVi: 'Định vị QR / NFC tức thì',
    titleEn: 'Instant QR / NFC Positioning',
    descVi:
      'Quét bất kỳ điểm neo vật lý nào để định vị vị trí của bạn trên mặt bằng 3D trong chưa đầy một giây.',
    descEn:
      'Scan any physical anchor point to lock your exact coordinates on the 3D floorplan in under a second.',
  },
  {
    icon: 'accessible-forward',
    accent: 'fuchsia',
    tagVi: 'THUẬT TOÁN ĐỒ THỊ',
    tagEn: 'GRAPH INTELLIGENCE',
    titleVi: 'Tìm đường thông minh A*',
    titleEn: 'Smart A* Pathfinding',
    descVi:
      'Tính toán lộ trình đa tầng tối ưu có xét đến thang máy, lối đi xe lăn và mật độ đám đông thời gian thực.',
    descEn:
      'Multi-floor routing that accounts for elevators, wheelchair accessibility, and real-time crowd congestion.',
  },
  {
    icon: 'auto-awesome',
    accent: 'violet',
    tagVi: 'TRÍ TUỆ KHÔNG GIAN',
    tagEn: 'COGNITIVE COPILOT',
    titleVi: 'Trợ lý Không gian AI',
    titleEn: 'AI Spatial Assistant',
    descVi:
      'Tìm kiếm bằng ngôn ngữ tự nhiên: "Tìm quán cà phê yên tĩnh nhất gần Cổng B12" và nhận dẫn đường từng bước.',
    descEn:
      'Natural language spatial queries: "Find the quietest coffee shop near Gate B12" with instant turn-by-turn guidance.',
  },
  {
    icon: 'local-fire-department',
    accent: 'cyan',
    tagVi: 'AN TOÀN SINH MẠNG',
    tagEn: 'SAFETY PROTOCOL',
    titleVi: 'Thoát hiểm khẩn cấp',
    titleEn: 'Emergency Evacuation',
    descVi:
      'Tự động định tuyến lại tránh các khu vực nguy hiểm và hiển thị lối thoát hiểm gần nhất theo thời gian thực.',
    descEn:
      'Automated hazard re-routing and live exit signage broadcasting when building alarm sensors trigger.',
  },
  {
    icon: 'hub',
    accent: 'fuchsia',
    tagVi: 'BẢO MẬT DOANH NGHIỆP',
    tagEn: 'ENTERPRISE SECURITY',
    titleVi: 'Cách ly Đa khách thuê (Multi-Tenant)',
    titleEn: 'Multi-Tenant Isolation',
    descVi:
      'Kiến trúc phân quyền RBAC nghiêm ngặt cho phép quản lý hàng trăm tòa nhà độc lập trên cùng một nền tảng.',
    descEn:
      'Strict RBAC workspace partitioning allowing property groups to manage ratusan of distinct venues securely.',
  },
];

const STAKEHOLDER_ROLES: Array<{
  icon: keyof typeof MaterialIcons.glyphMap;
  badge: string;
  color: string;
  bgTint: string;
  borderTint: string;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
}> = [
  {
    icon: 'person-pin-circle',
    badge: 'Visitor',
    color: '#5de6ff',
    bgTint: 'rgba(93, 230, 255, 0.14)',
    borderTint: 'rgba(93, 230, 255, 0.35)',
    titleVi: 'Khách tham quan (Visitor / Guest)',
    titleEn: 'Visitor / Guest',
    descVi:
      'Dẫn đường tức thì không cần cài đặt phức tạp. Quét mã QR để tìm phòng, cửa hàng và tiện ích trên bản đồ 3D.',
    descEn:
      'Frictionless browser-based wayfinding. Scan QR codes to locate rooms, amenities, and accessible routes.',
  },
  {
    icon: 'storefront',
    badge: 'Store Owner',
    color: '#fbbf24',
    bgTint: 'rgba(251, 191, 36, 0.14)',
    borderTint: 'rgba(251, 191, 36, 0.35)',
    titleVi: 'Chủ gian hàng (Store Owner)',
    titleEn: 'Store Owner',
    descVi:
      'Quản lý hồ sơ gian hàng, tung ưu đãi theo vị trí và theo dõi lưu lượng khách đi ngang qua gian hàng.',
    descEn:
      'Manage storefront metadata, publish time-sensitive promotions, and track visitor footfall conversion.',
  },
  {
    icon: 'corporate-fare',
    badge: 'Manager',
    color: '#d0bcff',
    bgTint: 'rgba(160, 120, 255, 0.16)',
    borderTint: 'rgba(208, 188, 255, 0.35)',
    titleVi: 'Quản lý tòa nhà (Building Manager)',
    titleEn: 'Building Manager',
    descVi:
      'Chỉnh sửa nút đồ thị dẫn đường, cập nhật mặt bằng tầng và khóa lối đi bảo trì theo thời gian thực.',
    descEn:
      'Edit floorplan nodes, calibrate routing graphs, and schedule maintenance corridor closures in real time.',
  },
  {
    icon: 'real-estate-agent',
    badge: 'Owner',
    color: '#34d399',
    bgTint: 'rgba(52, 211, 153, 0.14)',
    borderTint: 'rgba(52, 211, 153, 0.35)',
    titleVi: 'Chủ tòa nhà (Building Owner)',
    titleEn: 'Building Owner',
    descVi:
      'Theo dõi hiệu suất khai thác toàn bộ danh mục tòa nhà, bản đồ nhiệt lưu lượng và phân quyền nhân sự.',
    descEn:
      'Monitor portfolio-wide utilization, space valuation heatmaps, and tenant lease performance.',
  },
  {
    icon: 'admin-panel-settings',
    badge: 'Admin',
    color: '#f8acff',
    bgTint: 'rgba(248, 172, 255, 0.14)',
    borderTint: 'rgba(248, 172, 255, 0.35)',
    titleVi: 'Quản trị viên hệ thống (Platform Admin)',
    titleEn: 'Platform Admin',
    descVi:
      'Giám sát hạ tầng toàn cục, quản lý tài khoản doanh nghiệp, nhật ký kiểm toán và phân quyền RBAC.',
    descEn:
      'Global infrastructure oversight, multi-tenant provisioning, audit logging, and API rate governance.',
  },
];

const PIPELINE_STEPS: Array<{
  num: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  titleVi: string;
  titleEn: string;
  descVi: string;
  descEn: string;
}> = [
  {
    num: '01',
    icon: 'domain',
    titleVi: 'Tải lên bản vẽ CAD / BIM',
    titleEn: 'Upload CAD / BIM Blueprints',
    descVi:
      'Nhập trực tiếp file DWG, IFC hoặc GeoJSON. Công cụ vector tự động bóc tách tường, cửa và lối đi trong vài giây.',
    descEn:
      'Import DWG, IFC, or GeoJSON files. Our vector parser automatically extrudes walls, doors, and zones in seconds.',
  },
  {
    num: '02',
    icon: 'sensors',
    titleVi: 'Cấu hình Nút & Điểm POI',
    titleEn: 'Configure Nodes & Waypoints',
    descVi:
      'Đặt các điểm neo QR/BLE và tự động sinh đồ thị dẫn đường A* kết nối cầu thang, thang máy và hành lang.',
    descEn:
      'Place QR/BLE anchors and auto-generate A* navigation meshes across stairs, elevators, and corridors.',
  },
  {
    num: '03',
    icon: 'view-in-ar',
    titleVi: 'Xuất bản Trải nghiệm 3D Trực tuyến',
    titleEn: 'Publish Live 3D Experience',
    descVi:
      'Triển khai tức thì lên Kiosk, thiết bị di động và bảng điều khiển phân tích không gian thời gian thực.',
    descEn:
      'Deploy instantly to mobile web, kiosks, and SDK endpoints with live telemetry streaming.',
  },
];

const SPARKLINE_BARS = [35, 55, 75, 60, 90, 100, 85, 70, 95, 80, 50, 40];

export default function App() {
  const [lang, setLang] = useState<Lang>('VI');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState<LevelId>('L2');
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const levelInfo = LEVEL_DATA[activeLevel];

  const scrollToSection = (key: string) => {
    setDrawerOpen(false);
    const y = sectionOffsets.current[key];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y, animated: true });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ExpoStatusBar style="light" />

      {/* ── STICKY TOP GLASS NAVBAR (Synchronized with SpotWay Web) ── */}
      <View style={styles.navbar}>
        <TouchableOpacity
          style={styles.brandWrap}
          activeOpacity={0.85}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        >
          <LinearGradient
            colors={['rgba(160, 120, 255, 0.28)', 'rgba(93, 230, 255, 0.22)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandIconBox}
          >
            <MaterialIcons name="near-me" size={20} color="#5de6ff" />
            <View style={styles.brandPingDot} />
          </LinearGradient>
          <View style={styles.brandTextRow}>
            <Text style={styles.brandTitle}>SpotWay</Text>
            <View style={styles.brandSubBadge}>
              <Text style={styles.brandSubText}>SPATIAL OS</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.navRight}>
          {/* Language Pill */}
          <View style={styles.langPill}>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'VI' && styles.langBtnActive]}
              onPress={() => setLang('VI')}
            >
              <Text style={[styles.langBtnText, lang === 'VI' && styles.langBtnTextActive]}>VI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'EN' && styles.langBtnActive]}
              onPress={() => setLang('EN')}
            >
              <Text style={[styles.langBtnText, lang === 'EN' && styles.langBtnTextActive]}>EN</Text>
            </TouchableOpacity>
          </View>

          {/* Hamburger Drawer Button */}
          <TouchableOpacity
            style={styles.menuBtn}
            activeOpacity={0.8}
            onPress={() => setDrawerOpen((prev) => !prev)}
          >
            <MaterialIcons name={drawerOpen ? 'close' : 'menu'} size={22} color="#e3e0f6" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── COLLAPSIBLE MOBILE NAVIGATION DRAWER ── */}
      {drawerOpen && (
        <View style={styles.drawer}>
          <TouchableOpacity style={styles.drawerItem} onPress={() => scrollToSection('features')}>
            <MaterialIcons name="auto-awesome" size={18} color="#d0bcff" />
            <Text style={styles.drawerItemText}>
              {lang === 'VI' ? 'Tính năng nổi bật' : 'Features'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.drawerItem} onPress={() => scrollToSection('solutions')}>
            <MaterialIcons name="layers" size={18} color="#5de6ff" />
            <Text style={styles.drawerItemText}>
              {lang === 'VI' ? 'Giải pháp 5 Vai trò' : 'Solutions'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.drawerItem} onPress={() => scrollToSection('pipeline')}>
            <MaterialIcons name="view-in-ar" size={18} color="#f8acff" />
            <Text style={styles.drawerItemText}>
              {lang === 'VI' ? 'Quy trình 3 bước' : '3D Pipeline'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.drawerItem} onPress={() => scrollToSection('analytics')}>
            <MaterialIcons name="insights" size={18} color="#34d399" />
            <Text style={styles.drawerItemText}>
              {lang === 'VI' ? 'Phân tích lưu lượng' : 'Analytics'}
            </Text>
          </TouchableOpacity>

          <View style={styles.drawerDivider} />

          <View style={styles.drawerActions}>
            <TouchableOpacity
              style={styles.drawerGhostBtn}
              onPress={() => {
                setDrawerOpen(false);
                setSignInModalOpen(true);
              }}
            >
              <MaterialIcons name="login" size={16} color="#e3e0f6" />
              <Text style={styles.drawerGhostBtnText}>
                {lang === 'VI' ? 'Đăng nhập' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.drawerPrimaryWrap}
              onPress={() => {
                setDrawerOpen(false);
                setDemoModalOpen(true);
              }}
            >
              <LinearGradient
                colors={['#8b5cf6', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.drawerPrimaryBtn}
              >
                <MaterialIcons name="near-me" size={16} color="#0b0b1a" />
                <Text style={styles.drawerPrimaryBtnText}>
                  {lang === 'VI' ? 'Mở Bản đồ 3D' : 'Launch 3D Demo'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── MAIN SCROLLABLE CONTENT ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. HERO SECTION ── */}
        <View style={styles.heroSection}>
          {/* Live Status Pill */}
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusPillText}>
              {lang === 'VI'
                ? 'v2.4 Trí tuệ Không gian Trực tuyến'
                : 'v2.4 Spatial Intelligence Live'}
            </Text>
          </View>

          {/* Headline */}
          <Text style={styles.heroTitle}>Navigate every floor.</Text>
          <Text style={styles.heroTitleAccent}>Manage every space.</Text>

          {/* Subtitle */}
          <Text style={styles.heroSubtitle}>
            {lang === 'VI'
              ? 'Nền tảng bản sao số 3D đa tòa nhà với định vị dẫn đường chính xác từng mét, đo lường lưu lượng theo thời gian thực và số hóa mặt sàn tự động bằng AI.'
              : 'Enterprise 3D digital twin platform with sub-meter indoor wayfinding, real-time occupancy telemetry, and AI-automated floorplan digitization.'}
          </Text>

          {/* Full-Width Stacked CTA Buttons */}
          <View style={styles.heroActions}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setSignInModalOpen(true)}
              style={styles.fullWidthBtnWrap}
            >
              <LinearGradient
                colors={['#8b5cf6', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <MaterialIcons name="rocket-launch" size={18} color="#0b0b1a" />
                <Text style={styles.primaryBtnText}>
                  {lang === 'VI' ? 'Bắt đầu miễn phí' : 'Get Started Free'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.secondaryBtn}
              onPress={() => setDemoModalOpen(true)}
            >
              <MaterialIcons name="near-me" size={18} color="#5de6ff" />
              <Text style={styles.secondaryBtnText}>
                {lang === 'VI' ? 'Trải nghiệm Bản đồ 3D' : 'Explore 3D Demo'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── MOBILE 3D ISOMETRIC PREVIEW HUD CARD ── */}
          <View style={styles.hudCard}>
            {/* Top HUD Bar */}
            <View style={styles.hudHeader}>
              <View style={styles.hudHeaderLeft}>
                <View style={styles.hudCyanDot} />
                <Text style={styles.hudZoneText}>{levelInfo.zone}</Text>
              </View>
              <View style={styles.hudActivePill}>
                <Text style={styles.hudActivePillText}>{activeLevel} Active</Text>
              </View>
            </View>

            {/* Isometric 3D Blueprint Viewport */}
            <View style={styles.hudViewport}>
              <View style={styles.isoStack}>
                {/* Lower Ghost Floor */}
                <View style={styles.isoLayerGhost} />

                {/* Active Floor Layer */}
                <View style={styles.isoLayerActive}>
                  <View style={styles.blueprintRow}>
                    <View style={[styles.roomBox, styles.roomBoxViolet]}>
                      <Text style={styles.roomCodeViolet}>{levelInfo.roomTopLeft.code}</Text>
                      <Text style={styles.roomMeta}>{levelInfo.roomTopLeft.meta}</Text>
                    </View>
                    <View style={[styles.roomBox, styles.roomBoxCyan]}>
                      <Text style={styles.roomCodeCyan}>{levelInfo.roomTopRight.code}</Text>
                      <Text style={styles.roomMeta}>{levelInfo.roomTopRight.meta}</Text>
                    </View>
                  </View>

                  {/* Animated / Dashed SVG Route Path */}
                  <View style={styles.svgOverlay} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 240 140">
                      <Path
                        d={levelInfo.svgPath}
                        stroke="#5de6ff"
                        strokeWidth={2.5}
                        strokeDasharray="5, 3"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <Circle
                        cx={levelInfo.waypointX}
                        cy={levelInfo.waypointY}
                        r={6}
                        fill="#f8acff"
                        opacity={0.55}
                      />
                      <Circle
                        cx={levelInfo.waypointX}
                        cy={levelInfo.waypointY}
                        r={3.2}
                        fill="#ffffff"
                      />
                    </Svg>
                  </View>

                  <View style={styles.blueprintRow}>
                    <View style={[styles.roomBox, styles.roomBoxNeutral]}>
                      <Text style={styles.roomCodeNeutral}>{levelInfo.roomBottomLeft}</Text>
                    </View>
                    <View style={[styles.roomBox, styles.roomBoxFuchsia]}>
                      <Text style={styles.roomCodeFuchsia}>{levelInfo.roomBottomRight}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Floating Waypoint Callout Tooltip (Unified near-me icon) */}
              <View style={styles.hudCallout}>
                <MaterialIcons name="near-me" size={16} color="#5de6ff" />
                <View>
                  <Text style={styles.hudCalloutTitle}>{levelInfo.targetTitle}</Text>
                  <Text style={styles.hudCalloutSub}>{levelInfo.walkInfo}</Text>
                </View>
              </View>

              {/* Interactive Floor Switcher Widget (L1 / L2 / L3) */}
              <View style={styles.hudLevelSwitcher}>
                {(['L1', 'L2', 'L3'] as LevelId[]).map((lvl) => {
                  const isActive = activeLevel === lvl;
                  return (
                    <TouchableOpacity
                      key={lvl}
                      style={[styles.levelBtn, isActive && styles.levelBtnActive]}
                      onPress={() => setActiveLevel(lvl)}
                    >
                      <Text style={[styles.levelBtnText, isActive && styles.levelBtnTextActive]}>
                        {lvl}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Bottom Telemetry Ticker */}
            <View style={styles.hudTicker}>
              <View style={styles.hudTickerLeft}>
                <MaterialIcons name="sensors" size={15} color="#5de6ff" />
                <Text style={styles.hudTickerText}>{levelInfo.beacons}</Text>
              </View>
              <Text style={styles.hudTickerLatency}>Latency: {levelInfo.latency}</Text>
            </View>
          </View>
        </View>

        {/* ── 2. TRUSTED BY GLOBAL HUBS STRIP ── */}
        <View style={styles.trustedSection}>
          <Text style={styles.trustedLabel}>
            {lang === 'VI'
              ? 'ĐƯỢC TIN DÙNG BỞI CÁC TỔ HỢP & SÂN BAY QUỐC TẾ'
              : 'TRUSTED BY NEXT-GEN SMART VENUES & TRANSIT HUBS'}
          </Text>
          <View style={styles.trustedGrid}>
            {TRUSTED_HUBS.map((hub) => (
              <View key={hub.name} style={styles.trustedPill}>
                <MaterialIcons name={hub.icon} size={16} color={hub.color} />
                <Text style={styles.trustedPillText}>{hub.name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 3. BENTO FEATURE CARDS (6-Card Stack) ── */}
        <View
          style={styles.section}
          onLayout={(e) => {
            sectionOffsets.current.features = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.sectionEyebrow}>
            {lang === 'VI' ? 'KIẾN TRÚC NỀN TẢNG' : 'PLATFORM ARCHITECTURE'}
          </Text>
          <Text style={styles.sectionTitle}>
            {lang === 'VI'
              ? 'Trí tuệ không gian cho các tòa nhà phức hợp.'
              : 'Spatial intelligence engineered for scale.'}
          </Text>
          <Text style={styles.sectionSub}>
            {lang === 'VI'
              ? 'Kết hợp kết xuất 3D thời gian thực, thuật toán tìm đường A* và phân tích mật độ khách thuê trên một hệ điều hành duy nhất.'
              : 'Precision indoor positioning, 3D WebGL maps, and multi-tenant spatial analytics in one unified operating system.'}
          </Text>

          <View style={styles.cardStack}>
            {BENTO_FEATURES.map((feat, idx) => {
              const accentColor =
                feat.accent === 'violet'
                  ? '#d0bcff'
                  : feat.accent === 'cyan'
                  ? '#5de6ff'
                  : '#f8acff';
              const iconBg =
                feat.accent === 'violet'
                  ? 'rgba(160, 120, 255, 0.16)'
                  : feat.accent === 'cyan'
                  ? 'rgba(93, 230, 255, 0.14)'
                  : 'rgba(248, 172, 255, 0.14)';

              return (
                <View key={idx} style={styles.bentoCard}>
                  <View style={styles.bentoHeader}>
                    <View style={[styles.bentoIconBox, { backgroundColor: iconBg }]}>
                      <MaterialIcons name={feat.icon} size={22} color={accentColor} />
                    </View>
                    <Text style={[styles.bentoTag, { color: accentColor }]}>
                      {lang === 'VI' ? feat.tagVi : feat.tagEn}
                    </Text>
                  </View>

                  <Text style={styles.bentoTitle}>
                    {lang === 'VI' ? feat.titleVi : feat.titleEn}
                  </Text>
                  <Text style={styles.bentoDesc}>
                    {lang === 'VI' ? feat.descVi : feat.descEn}
                  </Text>

                  {feat.metrics && (
                    <View style={styles.bentoMetricsRow}>
                      {feat.metrics.map((m) => (
                        <View key={m.label} style={styles.bentoMetricCell}>
                          <Text style={[styles.bentoMetricValue, { color: m.color }]}>
                            {m.value}
                          </Text>
                          <Text style={styles.bentoMetricLabel}>{m.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── 4. 5-ROLE STAKEHOLDER ECOSYSTEM ── */}
        <View
          style={styles.sectionAlt}
          onLayout={(e) => {
            sectionOffsets.current.solutions = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionEyebrow, { color: '#5de6ff' }]}>
            {lang === 'VI' ? 'HỆ SINH THÁI ĐỒNG BỘ' : 'UNIFIED ECOSYSTEM'}
          </Text>
          <Text style={styles.sectionTitle}>
            {lang === 'VI'
              ? 'Thiết kế chuyên biệt cho 5 vai trò.'
              : 'Purpose-built for every stakeholder.'}
          </Text>

          <View style={styles.cardStack}>
            {STAKEHOLDER_ROLES.map((item) => (
              <View
                key={item.badge}
                style={[styles.roleCard, { borderLeftColor: item.color }]}
              >
                <View style={styles.roleHeader}>
                  <View
                    style={[
                      styles.roleIconBox,
                      { backgroundColor: item.bgTint, borderColor: item.borderTint },
                    ]}
                  >
                    <MaterialIcons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View
                    style={[
                      styles.roleBadge,
                      { backgroundColor: item.bgTint, borderColor: item.borderTint },
                    ]}
                  >
                    <Text style={[styles.roleBadgeText, { color: item.color }]}>
                      {item.badge}
                    </Text>
                  </View>
                </View>

                <Text style={styles.roleTitle}>
                  {lang === 'VI' ? item.titleVi : item.titleEn}
                </Text>
                <Text style={styles.roleDesc}>
                  {lang === 'VI' ? item.descVi : item.descEn}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 5. 3-STEP PIPELINE (HOW IT WORKS) ── */}
        <View
          style={styles.section}
          onLayout={(e) => {
            sectionOffsets.current.pipeline = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionEyebrow, { color: '#f8acff' }]}>
            {lang === 'VI' ? 'QUY TRÌNH TRIỂN KHAI' : 'DEPLOYMENT PIPELINE'}
          </Text>
          <Text style={styles.sectionTitle}>
            {lang === 'VI'
              ? 'Từ bản vẽ CAD đến Bản sao số 3D trong 3 bước.'
              : 'From blueprint to live 3D twin in 3 steps.'}
          </Text>

          <View style={styles.cardStack}>
            {PIPELINE_STEPS.map((step) => (
              <View key={step.num} style={styles.stepCard}>
                <View style={styles.stepLeftCol}>
                  <View style={styles.stepNumCircle}>
                    <Text style={styles.stepNumText}>{step.num}</Text>
                  </View>
                  <View style={styles.stepIconBadge}>
                    <MaterialIcons name={step.icon} size={18} color="#5de6ff" />
                  </View>
                </View>

                <View style={styles.stepRightCol}>
                  <Text style={styles.stepTitle}>
                    {lang === 'VI' ? step.titleVi : step.titleEn}
                  </Text>
                  <Text style={styles.stepDesc}>
                    {lang === 'VI' ? step.descVi : step.descEn}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── 6. LIVE TELEMETRY & SPATIAL ANALYTICS ── */}
        <View
          style={styles.sectionAlt}
          onLayout={(e) => {
            sectionOffsets.current.analytics = e.nativeEvent.layout.y;
          }}
        >
          <Text style={[styles.sectionEyebrow, { color: '#5de6ff' }]}>
            {lang === 'VI' ? 'ĐO LƯỜNG THỜI GIAN THỰC' : 'LIVE TELEMETRY'}
          </Text>
          <Text style={styles.sectionTitle}>
            {lang === 'VI'
              ? 'Phân tích lưu lượng & hiệu suất mặt bằng.'
              : 'Real-time spatial intelligence.'}
          </Text>

          {/* 2x2 Metric Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricCardValue}>500+</Text>
              <Text style={styles.metricCardLabel}>
                {lang === 'VI' ? 'Tòa nhà đã số hóa' : 'Buildings Mapped'}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={[styles.metricCardValue, { color: '#5de6ff' }]}>12M+</Text>
              <Text style={styles.metricCardLabel}>
                {lang === 'VI' ? 'Lộ trình đã dẫn đường' : 'Routes Computed'}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={[styles.metricCardValue, { color: '#f8acff' }]}>&lt; 50ms</Text>
              <Text style={styles.metricCardLabel}>
                {lang === 'VI' ? 'Tốc độ tìm đường A*' : 'Avg Pathfinding'}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={[styles.metricCardValue, { color: '#34d399' }]}>99.98%</Text>
              <Text style={styles.metricCardLabel}>
                {lang === 'VI' ? 'Thời gian hoạt động' : 'System Uptime'}
              </Text>
            </View>
          </View>

          {/* Footfall Density Histogram Card */}
          <View style={styles.telemetryCard}>
            <View style={styles.telemetryHeader}>
              <View>
                <Text style={styles.telemetryEyebrow}>
                  {lang === 'VI'
                    ? 'MẬT ĐỘ LƯU LƯỢNG — SẢNH TẦNG 2'
                    : 'FOOTFALL DENSITY — LEVEL 2 ATRIUM'}
                </Text>
                <Text style={styles.telemetryValue}>4,820 / hr</Text>
              </View>
              <View style={styles.telemetryTrendPill}>
                <Text style={styles.telemetryTrendText}>+18.4% vs last week</Text>
              </View>
            </View>

            <View style={styles.sparklineRow}>
              {SPARKLINE_BARS.map((heightPct, idx) => (
                <View key={idx} style={styles.sparklineBarTrack}>
                  <LinearGradient
                    colors={['#22d3ee', '#8b5cf6']}
                    style={[styles.sparklineBarFill, { height: `${heightPct}%` }]}
                  />
                </View>
              ))}
            </View>

            <View style={styles.sparklineAxis}>
              <Text style={styles.sparklineAxisText}>08:00</Text>
              <Text style={styles.sparklineAxisText}>12:00</Text>
              <Text style={styles.sparklineAxisText}>16:00</Text>
              <Text style={styles.sparklineAxisText}>20:00</Text>
            </View>
          </View>
        </View>

        {/* ── 7. FINAL AURORA CTA BANNER ── */}
        <View style={styles.ctaSection}>
          <LinearGradient
            colors={['rgba(30, 30, 52, 0.95)', 'rgba(18, 18, 33, 0.98)']}
            style={styles.ctaCard}
          >
            <LinearGradient
              colors={['rgba(160, 120, 255, 0.35)', 'rgba(93, 230, 255, 0.25)']}
              style={styles.ctaIconBadge}
            >
              <MaterialIcons name="near-me" size={24} color="#5de6ff" />
            </LinearGradient>

            <Text style={styles.ctaTitle}>
              {lang === 'VI'
                ? 'Sẵn sàng chuyển đổi số không gian tòa nhà?'
                : 'Ready to transform your building?'}
            </Text>
            <Text style={styles.ctaSub}>
              {lang === 'VI'
                ? 'Triển khai bản đồ 3D tương tác đầu tiên của bạn chỉ trong vài phút. Miễn phí cho tối đa 2 tầng.'
                : 'Deploy your first interactive 3D floorplan in minutes. Free tier includes up to 2 floors and 50 POIs.'}
            </Text>

            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.fullWidthBtnWrap}
              onPress={() => setSignInModalOpen(true)}
            >
              <LinearGradient
                colors={['#8b5cf6', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>
                  {lang === 'VI' ? 'Tạo Không gian Miễn phí' : 'Create Free Workspace'}
                </Text>
                <MaterialIcons name="arrow-forward" size={18} color="#0b0b1a" />
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setDemoModalOpen(true)}
            >
              <MaterialIcons name="3d-rotation" size={18} color="#d0bcff" />
              <Text style={styles.secondaryBtnText}>
                {lang === 'VI' ? 'Mở Bản đồ 3D Kiosk' : 'Interactive 3D Kiosk'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.ctaFootnote}>
              NO CREDIT CARD REQUIRED · SOC2 TYPE II CERTIFIED
            </Text>
          </LinearGradient>
        </View>

        {/* ── 8. FOOTER (Synchronized Brand & Status) ── */}
        <View style={styles.footer}>
          <View style={styles.brandWrap}>
            <LinearGradient
              colors={['rgba(160, 120, 255, 0.28)', 'rgba(93, 230, 255, 0.22)']}
              style={styles.brandIconBox}
            >
              <MaterialIcons name="near-me" size={18} color="#5de6ff" />
            </LinearGradient>
            <View style={styles.brandTextRow}>
              <Text style={styles.brandTitle}>SpotWay</Text>
              <View style={styles.brandSubBadge}>
                <Text style={styles.brandSubText}>SPATIAL OS</Text>
              </View>
            </View>
          </View>

          <Text style={styles.footerTagline}>
            {lang === 'VI'
              ? 'Hệ điều hành dẫn đường 3D trong nhà và quản trị không gian đa tòa nhà thế hệ mới.'
              : 'Atmospheric minimalism & high-craft spatial intelligence for modern architecture.'}
          </Text>

          <View style={styles.footerStatusRow}>
            <View style={styles.footerStatusDot} />
            <Text style={styles.footerStatusText}>All Spatial Nodes Operational</Text>
          </View>

          <Text style={styles.footerCopy}>
            © 2026 SpotWay Spatial OS Inc. All rights reserved.
          </Text>
        </View>
      </ScrollView>

      {/* ── MODAL 1: INTERACTIVE 3D MAP EXPLORER ── */}
      <Modal
        visible={demoModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDemoModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <MaterialIcons name="near-me" size={20} color="#5de6ff" />
                <Text style={styles.modalTitle}>SpotWay 3D Kiosk Explorer</Text>
              </View>
              <TouchableOpacity onPress={() => setDemoModalOpen(false)}>
                <MaterialIcons name="close" size={22} color="#cbc3d7" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              {lang === 'VI'
                ? 'Chọn tầng để kiểm tra lộ trình dẫn đường A* và trạng thái cảm biến UWB/BLE:'
                : 'Select a floor level to inspect A* pathfinding and live UWB/BLE beacon nodes:'}
            </Text>

            <View style={styles.modalLevelTabs}>
              {(['L1', 'L2', 'L3'] as LevelId[]).map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  style={[
                    styles.modalLevelTab,
                    activeLevel === lvl && styles.modalLevelTabActive,
                  ]}
                  onPress={() => setActiveLevel(lvl)}
                >
                  <MaterialIcons
                    name="layers"
                    size={16}
                    color={activeLevel === lvl ? '#0b0b1a' : '#d0bcff'}
                  />
                  <Text
                    style={[
                      styles.modalLevelTabText,
                      activeLevel === lvl && styles.modalLevelTabTextActive,
                    ]}
                  >
                    Floor {lvl}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalInfoBox}>
              <Text style={styles.modalInfoLabel}>ACTIVE ZONE</Text>
              <Text style={styles.modalInfoValue}>{levelInfo.zone}</Text>
              <Text style={styles.modalInfoMeta}>
                Target: {levelInfo.targetTitle} · {levelInfo.walkInfo} · {levelInfo.beacons}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.fullWidthBtnWrap}
              onPress={() => setDemoModalOpen(false)}
            >
              <LinearGradient
                colors={['#8b5cf6', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <MaterialIcons name="check-circle" size={18} color="#0b0b1a" />
                <Text style={styles.primaryBtnText}>
                  {lang === 'VI' ? 'Đồng bộ lộ trình trên bản đồ' : 'Sync Route to HUD'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: SIGN IN / WORKSPACE AUTH ── */}
      <Modal
        visible={signInModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setSignInModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <MaterialIcons name="near-me" size={20} color="#d0bcff" />
                <Text style={styles.modalTitle}>
                  {lang === 'VI' ? 'Đăng nhập SpotWay OS' : 'SpotWay OS Sign In'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSignInModalOpen(false)}>
                <MaterialIcons name="close" size={22} color="#cbc3d7" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>EMAIL WORKSPACE</Text>
            <TextInput
              style={styles.textInput}
              placeholder="name@company.com"
              placeholderTextColor="#6e687d"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.inputLabel}>
              {lang === 'VI' ? 'MẬT KHẨU' : 'PASSWORD'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor="#6e687d"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              style={[styles.fullWidthBtnWrap, { marginTop: 8 }]}
              onPress={() => setSignInModalOpen(false)}
            >
              <LinearGradient
                colors={['#8b5cf6', '#22d3ee']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtn}
              >
                <MaterialIcons name="login" size={18} color="#0b0b1a" />
                <Text style={styles.primaryBtnText}>
                  {lang === 'VI' ? 'Truy cập Hệ thống' : 'Sign In to Workspace'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121221',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  navbar: {
    height: 62,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(18, 18, 33, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  brandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(93, 230, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  brandPingDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#5de6ff',
    borderWidth: 1.5,
    borderColor: '#121221',
  },
  brandTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e3e0f6',
    letterSpacing: -0.4,
  },
  brandSubBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: 'rgba(160, 120, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.3)',
  },
  brandSubText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d0bcff',
    letterSpacing: 0.6,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langPill: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2a',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  langBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  langBtnActive: {
    backgroundColor: 'rgba(160, 120, 255, 0.28)',
  },
  langBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#958ea0',
  },
  langBtnTextActive: {
    color: '#e3e0f6',
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1e1e2e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawer: {
    backgroundColor: '#181828',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(208, 188, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    zIndex: 40,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  drawerItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e3e0f6',
  },
  drawerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 6,
  },
  drawerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  drawerGhostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#252438',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  drawerGhostBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e3e0f6',
  },
  drawerPrimaryWrap: {
    flex: 1.3,
  },
  drawerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  drawerPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0b0b1a',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 36,
  },
  heroSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 28,
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 30, 46, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 18,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5de6ff',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5de6ff',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#e3e0f6',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  heroTitleAccent: {
    fontSize: 34,
    fontWeight: '700',
    color: '#5de6ff',
    textAlign: 'center',
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: 14,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: '#cbc3d7',
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  heroActions: {
    width: '100%',
    gap: 12,
    marginBottom: 26,
  },
  fullWidthBtnWrap: {
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0b0b1a',
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(41, 40, 57, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e3e0f6',
  },
  hudCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: 'rgba(26, 26, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.22)',
    padding: 14,
  },
  hudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  hudHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hudCyanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5de6ff',
  },
  hudZoneText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#cbc3d7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hudActivePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(160, 120, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.35)',
  },
  hudActivePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d0bcff',
  },
  hudViewport: {
    height: 230,
    borderRadius: 14,
    backgroundColor: '#0d0d1c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  isoStack: {
    width: 236,
    height: 142,
    transform: [{ rotate: '-8deg' }],
    position: 'relative',
  },
  isoLayerGhost: {
    position: 'absolute',
    top: 14,
    left: 12,
    right: -12,
    bottom: -14,
    borderRadius: 12,
    backgroundColor: 'rgba(160, 120, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.2)',
  },
  isoLayerActive: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 26, 44, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(93, 230, 255, 0.6)',
    padding: 10,
    justifyContent: 'space-between',
    position: 'relative',
  },
  blueprintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  roomBox: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
  },
  roomBoxViolet: {
    backgroundColor: 'rgba(160, 120, 255, 0.2)',
    borderColor: 'rgba(208, 188, 255, 0.45)',
  },
  roomBoxCyan: {
    backgroundColor: 'rgba(93, 230, 255, 0.14)',
    borderColor: 'rgba(93, 230, 255, 0.4)',
  },
  roomBoxNeutral: {
    backgroundColor: 'rgba(52, 51, 68, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  roomBoxFuchsia: {
    backgroundColor: 'rgba(248, 172, 255, 0.18)',
    borderColor: 'rgba(248, 172, 255, 0.45)',
  },
  roomCodeViolet: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d0bcff',
  },
  roomCodeCyan: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5de6ff',
  },
  roomCodeNeutral: {
    fontSize: 9,
    fontWeight: '700',
    color: '#cbc3d7',
  },
  roomCodeFuchsia: {
    fontSize: 9,
    fontWeight: '700',
    color: '#f8acff',
  },
  roomMeta: {
    fontSize: 8,
    color: '#958ea0',
    marginTop: 2,
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hudCallout: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(18, 18, 33, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(93, 230, 255, 0.35)',
  },
  hudCalloutTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e3e0f6',
  },
  hudCalloutSub: {
    fontSize: 9,
    color: '#cbc3d7',
  },
  hudLevelSwitcher: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(18, 18, 33, 0.92)',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 4,
  },
  levelBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
  },
  levelBtnActive: {
    backgroundColor: '#a078ff',
  },
  levelBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#958ea0',
  },
  levelBtnTextActive: {
    color: '#23005c',
  },
  hudTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  hudTickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudTickerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbc3d7',
  },
  hudTickerLatency: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5de6ff',
  },
  trustedSection: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    backgroundColor: '#0d0d1c',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  trustedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#958ea0',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  trustedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  trustedPill: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#1a1a2a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  trustedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbc3d7',
    letterSpacing: 0.4,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  sectionAlt: {
    paddingHorizontal: 16,
    paddingVertical: 32,
    backgroundColor: '#161627',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#d0bcff',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e3e0f6',
    lineHeight: 30,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  sectionSub: {
    fontSize: 13,
    lineHeight: 20,
    color: '#cbc3d7',
    marginBottom: 20,
  },
  cardStack: {
    gap: 14,
    marginTop: 12,
  },
  bentoCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: 'rgba(30, 30, 46, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  bentoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bentoIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  bentoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e3e0f6',
    marginBottom: 6,
  },
  bentoDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: '#cbc3d7',
  },
  bentoMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.07)',
  },
  bentoMetricCell: {
    flex: 1,
    backgroundColor: '#121221',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  bentoMetricValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  bentoMetricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#958ea0',
    marginTop: 2,
  },
  roleCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: 'rgba(30, 30, 46, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftWidth: 4,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  roleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e3e0f6',
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#cbc3d7',
  },
  stepCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: 'rgba(30, 30, 46, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    gap: 14,
  },
  stepLeftCol: {
    alignItems: 'center',
    gap: 8,
  },
  stepNumCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(160, 120, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d0bcff',
  },
  stepIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(93, 230, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRightCol: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e3e0f6',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: '#cbc3d7',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: '48.2%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(30, 30, 46, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metricCardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#d0bcff',
  },
  metricCardLabel: {
    fontSize: 11,
    color: '#cbc3d7',
    marginTop: 4,
  },
  telemetryCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: 'rgba(30, 30, 46, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  telemetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  telemetryEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: '#958ea0',
    letterSpacing: 0.6,
  },
  telemetryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e3e0f6',
    marginTop: 2,
  },
  telemetryTrendPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(93, 230, 255, 0.14)',
  },
  telemetryTrendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5de6ff',
  },
  sparklineRow: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 5,
  },
  sparklineBarTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  sparklineBarFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  sparklineAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sparklineAxisText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#958ea0',
  },
  ctaSection: {
    paddingHorizontal: 16,
    paddingVertical: 28,
  },
  ctaCard: {
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.3)',
    alignItems: 'center',
  },
  ctaIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(93, 230, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e3e0f6',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 8,
  },
  ctaSub: {
    fontSize: 13,
    lineHeight: 20,
    color: '#cbc3d7',
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaFootnote: {
    fontSize: 9,
    fontWeight: '700',
    color: '#958ea0',
    letterSpacing: 0.7,
    marginTop: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0d0d1c',
    gap: 12,
  },
  footerTagline: {
    fontSize: 12,
    lineHeight: 18,
    color: '#958ea0',
  },
  footerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  footerStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbc3d7',
  },
  footerCopy: {
    fontSize: 11,
    color: '#6e687d',
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 20, 0.82)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderRadius: 22,
    padding: 20,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.28)',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e3e0f6',
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 19,
    color: '#cbc3d7',
  },
  modalLevelTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  modalLevelTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#252438',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.25)',
  },
  modalLevelTabActive: {
    backgroundColor: '#5de6ff',
    borderColor: '#5de6ff',
  },
  modalLevelTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d0bcff',
  },
  modalLevelTabTextActive: {
    color: '#0b0b1a',
  },
  modalInfoBox: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#121221',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  modalInfoLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#5de6ff',
    letterSpacing: 0.6,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e3e0f6',
  },
  modalInfoMeta: {
    fontSize: 12,
    color: '#cbc3d7',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d0bcff',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  textInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#121221',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.25)',
    color: '#e3e0f6',
    fontSize: 14,
  },
});
