import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { API_CANDIDATES } from '../config';

export type Lang = 'VI' | 'EN';

export interface MobileAuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantName?: string | null;
  subdomain?: string | null;
  accessToken?: string;
}

interface LoginScreenProps {
  lang: Lang;
  onToggleLang: () => void;
  onLoginSuccess: (user: MobileAuthUser) => void;
  onContinueAsGuest: () => void;
  onBackToHome: () => void;
}

type LoginFailure = 'INVALID_CREDENTIALS' | 'TENANT_SUSPENDED' | 'LOGIN_FAILED' | 'NETWORK_ERROR';

class LoginError extends Error {
  constructor(readonly code: LoginFailure) {
    super(code);
  }
}

/** Signs in against the real backend. Only a network failure moves on to the next candidate URL. */
async function backendLogin(email: string, password: string): Promise<MobileAuthUser> {
  for (const base of API_CANDIDATES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code: string | undefined = json?.error?.code ?? json?.code;
      if (res.status === 401 || code === 'INVALID_CREDENTIALS') throw new LoginError('INVALID_CREDENTIALS');
      if (code === 'TENANT_SUSPENDED') throw new LoginError('TENANT_SUSPENDED');
      throw new LoginError('LOGIN_FAILED');
    }

    const accessToken: string = (json?.data ?? json)?.accessToken ?? '';
    if (!accessToken) throw new LoginError('LOGIN_FAILED');

    const meRes = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => null);
    if (!meRes?.ok) throw new LoginError('LOGIN_FAILED');
    const me = ((await meRes.json().catch(() => ({}))) as { data?: Record<string, any> }).data;
    if (!me?.id || !me?.role) throw new LoginError('LOGIN_FAILED');

    return {
      id: me.id,
      email: me.email ?? email,
      name: me.name ?? email.split('@')[0],
      role: me.role,
      tenantName: me.tenant?.name ?? null,
      subdomain: me.tenant?.subdomain ?? null,
      accessToken,
    };
  }
  throw new LoginError('NETWORK_ERROR');
}

export function LoginScreen({
  lang,
  onToggleLang,
  onLoginSuccess,
  onContinueAsGuest,
  onBackToHome,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isVi = lang === 'VI';

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage(
        isVi ? 'Vui lòng nhập địa chỉ email đăng nhập.' : 'Please enter your work email address.',
      );
      return;
    }
    if (!password) {
      setErrorMessage(isVi ? 'Vui lòng nhập mật khẩu.' : 'Please enter your password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      onLoginSuccess(await backendLogin(trimmedEmail, password));
    } catch (err) {
      const code: LoginFailure = err instanceof LoginError ? err.code : 'LOGIN_FAILED';
      const messages: Record<LoginFailure, [string, string]> = {
        INVALID_CREDENTIALS: ['Email hoặc mật khẩu không chính xác.', 'Incorrect email or password.'],
        TENANT_SUSPENDED: [
          'Không gian làm việc đang bị tạm khóa. Vui lòng liên hệ quản trị viên.',
          'Your workspace is suspended. Please contact your administrator.',
        ],
        NETWORK_ERROR: [
          'Không kết nối được máy chủ SpotWay. Kiểm tra mạng hoặc địa chỉ máy chủ rồi thử lại.',
          'Cannot reach the SpotWay server. Check your connection or server address and try again.',
        ],
        LOGIN_FAILED: ['Đăng nhập thất bại. Vui lòng thử lại sau.', 'Sign-in failed. Please try again later.'],
      };
      setErrorMessage(messages[code][isVi ? 0 : 1]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSsoPress = (provider: 'Google' | 'Microsoft') => {
    Alert.alert(
      `SpotWay ${provider} SSO`,
      isVi
        ? `Tính năng đăng nhập một lần với ${provider} sẽ sớm được kích hoạt trên thiết bị di động.`
        : `Single Sign-On with ${provider} will be available in the upcoming mobile release.`,
    );
  };

  const handleForgotPassword = () => {
    Alert.alert(
      isVi ? 'Khôi phục mật khẩu' : 'Password Recovery',
      isVi
        ? 'Tài khoản được cấp phát và quản lý bởi Quản trị viên hoặc Chủ tòa nhà. Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.'
        : 'Accounts are provisioned by your Building Owner or Platform Administrator. Please contact your administrator to reset your password.',
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Ambient Aurora Glow Spheres ── */}
      <View style={styles.ambientContainer} pointerEvents="none">
        <View style={styles.ambientOrbViolet} />
        <View style={styles.ambientOrbCyan} />
        <View style={styles.ambientOrbFuchsia} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Top Brand & Version Bar (Synchronized with SpotWay Web near-me icon) ── */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.brandRow}
            activeOpacity={0.85}
            onPress={onBackToHome}
          >
            <LinearGradient
              colors={['#a078ff', '#5de6ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandLogoBox}
            >
              <MaterialIcons name="near-me" size={20} color="#0d0d1c" />
            </LinearGradient>
            <View>
              <Text style={styles.brandName}>SpotWay</Text>
              <Text style={styles.brandSub}>SPATIAL OS</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            <View style={styles.versionPill}>
              <View style={styles.versionDot} />
              <Text style={styles.versionText}>v2.4</Text>
            </View>
            <TouchableOpacity
              style={styles.backHomeBtn}
              onPress={onBackToHome}
              activeOpacity={0.8}
            >
              <MaterialIcons name="home" size={18} color="#cbc3d7" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 2. Compact Aurora Spatial Preview Card ── */}
        <LinearGradient
          colors={['rgba(30, 30, 46, 0.9)', 'rgba(41, 40, 57, 0.72)', 'rgba(26, 26, 42, 0.92)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.previewCard}
        >
          {/* Isometric Visual Mini-Canvas */}
          <View style={styles.miniCanvas}>
            <Svg width="100%" height="100%" viewBox="0 0 340 110">
              <Defs>
                <SvgLinearGradient id="cyanRouteGradient" x1="30" y1="85" x2="290" y2="42" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#5de6ff" />
                  <Stop offset="0.6" stopColor="#a078ff" />
                  <Stop offset="1" stopColor="#2fd9f4" />
                </SvgLinearGradient>
              </Defs>

              {/* Soft outer path glow */}
              <Path
                d="M 30 85 L 110 50 L 175 68 L 245 32 L 290 42"
                stroke="rgba(208, 188, 255, 0.25)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {/* Dashed cyan-violet route path */}
              <Path
                d="M 30 85 L 110 50 L 175 68 L 245 32 L 290 42"
                stroke="url(#cyanRouteGradient)"
                strokeWidth={2.5}
                strokeDasharray="6, 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />

              {/* Waypoint Nodes */}
              <Circle cx={30} cy={85} r={4.5} fill="#5de6ff" />
              <Circle cx={110} cy={50} r={2.8} fill="#a078ff" />
              <Circle cx={175} cy={68} r={2.8} fill="#a078ff" />
              <Circle cx={245} cy={32} r={3.2} fill="#5de6ff" />
              <Circle cx={290} cy={42} r={5.5} fill="#f8acff" />
            </Svg>

            {/* Floating Destination Waypoint Pill (Synchronized near-me icon) */}
            <View style={styles.destinationPill}>
              <MaterialIcons name="near-me" size={13} color="#5de6ff" />
              <Text style={styles.destinationPillText}>Room 3.12 · 2 min walk</Text>
            </View>

            {/* Telemetry Floor Level Badge */}
            <View style={styles.floorBadge}>
              <Text style={styles.floorBadgeCode}>L3</Text>
              <Text style={styles.floorBadgeWing}>NORTH WING</Text>
            </View>
          </View>

          {/* Tagline below viewport preview */}
          <View style={styles.previewFooterRow}>
            <Text style={styles.previewTagline}>Find your spot. Find your way.</Text>
            <MaterialIcons name="hub" size={18} color="#5de6ff" />
          </View>
        </LinearGradient>

        {/* ── 3. Main Glassmorphism Form Card ── */}
        <View style={styles.formCard}>
          {/* Secure Badge & Title */}
          <View>
            <View style={styles.secureBadge}>
              <View style={styles.secureBadgeDot} />
              <Text style={styles.secureBadgeText}>
                {isVi ? 'TRUY CẬP KHÔNG GIAN BẢO MẬT' : 'SECURE SPATIAL ACCESS'}
              </Text>
            </View>
            <Text style={styles.formTitle}>
              {isVi ? 'Chào mừng trở lại' : 'Welcome back'}
            </Text>
            <Text style={styles.formSubtitle}>
              {isVi
                ? 'Đăng nhập để quản lý không gian và dữ liệu sơ đồ của bạn'
                : 'Sign in to manage your spaces'}
            </Text>
          </View>

          {/* Form Inputs Group (Work Email + Password) */}
          <View style={styles.fieldsGroup}>

            {/* Email Field */}
            <View style={styles.fieldItem}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>
                  {isVi ? 'Email công việc' : 'Work Email'}
                </Text>
                <Text style={styles.fieldLabelHint}>SpotWay ID</Text>
              </View>
              <View style={styles.inputBox}>
                <MaterialIcons name="mail-outline" size={18} color="#958ea0" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="name@company.com"
                  placeholderTextColor="#958ea0"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
              </View>
            </View>

            {/* Password Field with inline eye toggle & dynamic error state */}
            <View style={styles.fieldItem}>
              <Text style={styles.fieldLabel}>
                {isVi ? 'Mật khẩu' : 'Password'}
              </Text>
              <View
                style={[
                  styles.inputBox,
                  errorMessage ? styles.inputBoxError : null,
                ]}
              >
                <MaterialIcons
                  name="lock-outline"
                  size={18}
                  color={errorMessage ? '#ffb4ab' : '#958ea0'}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder={isVi ? 'Nhập mật khẩu bảo mật' : 'Enter your security code'}
                  placeholderTextColor="#958ea0"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((prev) => !prev)}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility-off' : 'visibility'}
                    size={18}
                    color="#958ea0"
                  />
                </TouchableOpacity>
              </View>

              {/* Soft Inline Error Banner / Callout */}
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <MaterialIcons name="warning-amber" size={16} color="#ffb4ab" style={{ marginTop: 1 }} />
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}
            </View>

            {/* Remember Me & Forgot Password Row */}
            <View style={styles.rememberRow}>
              <TouchableOpacity
                style={styles.rememberCheckWrap}
                activeOpacity={0.8}
                onPress={() => setRememberMe((prev) => !prev)}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <MaterialIcons name="check" size={13} color="#0d0d1c" />}
                </View>
                <Text style={styles.rememberText}>
                  {isVi ? 'Ghi nhớ đăng nhập' : 'Remember me'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>
                  {isVi ? 'Quên mật khẩu?' : 'Forgot password?'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Full-Width Violet-to-Cyan Gradient Submit Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              disabled={submitting}
              onPress={handleSignIn}
              style={styles.submitBtnWrap}
            >
              <LinearGradient
                colors={['#a078ff', '#6d3bd7', '#5de6ff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtn}
              >
                {submitting ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.submitBtnText}>
                      {isVi ? 'Đang xác thực...' : 'Signing in...'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.submitBtnText}>
                      {isVi ? 'Đăng nhập' : 'Sign in'}
                    </Text>
                    <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* "or continue with" Divider */}
          <View style={styles.dividerWrap}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>
              {isVi ? 'HOẶC TIẾP TỤC VỚI' : 'OR CONTINUE WITH'}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Outlined Glass Buttons for Google and Microsoft */}
          <View style={styles.ssoGrid}>
            <TouchableOpacity
              style={styles.ssoBtn}
              activeOpacity={0.8}
              onPress={() => handleSsoPress('Google')}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.8 5 12 5z"
                  fill="#EA4335"
                />
                <Path
                  d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5.1 3.7-8.8z"
                  fill="#4285F4"
                />
                <Path
                  d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.3 0 10.4 0 12.6s.6 4.3 1.6 6.2l3.7-4.1z"
                  fill="#FBBC05"
                />
                <Path
                  d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.2 0-5.8-2.4-6.7-5.3L1.6 16.4C3.5 20.4 7.4 23.5 12 23.5z"
                  fill="#34A853"
                />
              </Svg>
              <Text style={styles.ssoBtnText}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ssoBtn}
              activeOpacity={0.8}
              onPress={() => handleSsoPress('Microsoft')}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path d="M1 1h10v10H1z" fill="#F25022" />
                <Path d="M13 1h10v10H13z" fill="#7FBA00" />
                <Path d="M1 13h10v10H1z" fill="#00A4EF" />
                <Path d="M13 13h10v10H13z" fill="#FFB900" />
              </Svg>
              <Text style={styles.ssoBtnText}>Microsoft</Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Alternative Actions */}
          <View style={styles.bottomActions}>
            <Text style={styles.newToText}>
              {isVi ? 'Chưa có tài khoản SpotWay? ' : 'New to SpotWay? '}
              <Text style={styles.requestDemoLink} onPress={handleForgotPassword}>
                {isVi ? 'Liên hệ Quản trị viên' : 'Request a demo'}
              </Text>
            </Text>

            {/* Guest Access Action */}
            <TouchableOpacity
              style={styles.guestBtn}
              activeOpacity={0.8}
              onPress={onContinueAsGuest}
            >
              <MaterialIcons name="qr-code-scanner" size={18} color="#5de6ff" />
              <Text style={styles.guestBtnText}>
                {isVi ? 'Tiếp tục với tư cách Khách (Kiosk 3D)' : 'Continue as guest'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. Clean Compact Bottom Footer ── */}
        <View style={styles.footerBar}>
          <View style={styles.footerLinks}>
            <Text style={styles.footerLinkText}>Terms</Text>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerLinkText}>Privacy</Text>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerLinkText}>Status</Text>
          </View>

          <TouchableOpacity
            style={styles.langToggleBtn}
            activeOpacity={0.8}
            onPress={onToggleLang}
          >
            <MaterialIcons name="language" size={14} color="#5de6ff" />
            <Text style={styles.langToggleText}>{lang === 'VI' ? 'VI / EN' : 'EN / VI'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0d1c',
  },
  ambientContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  ambientOrbViolet: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(160, 120, 255, 0.18)',
  },
  ambientOrbCyan: {
    position: 'absolute',
    top: '32%',
    left: -100,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(0, 203, 230, 0.14)',
  },
  ambientOrbFuchsia: {
    position: 'absolute',
    bottom: -70,
    right: '15%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(209, 100, 226, 0.12)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogoBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e3e0f6',
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  brandSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5de6ff',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(30, 30, 46, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.45)',
  },
  versionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5de6ff',
  },
  versionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#cbc3d7',
  },
  backHomeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(30, 30, 46, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCard: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.5)',
  },
  miniCanvas: {
    height: 112,
    width: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(13, 13, 28, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    position: 'relative',
  },
  destinationPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(41, 40, 57, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(93, 230, 255, 0.4)',
  },
  destinationPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#e3e0f6',
  },
  floorBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(13, 13, 28, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.45)',
  },
  floorBadgeCode: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5de6ff',
  },
  floorBadgeWing: {
    fontSize: 10,
    fontWeight: '600',
    color: '#cbc3d7',
  },
  previewFooterRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTagline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e3e0f6',
    letterSpacing: -0.2,
  },
  formCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: 'rgba(30, 30, 46, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.45)',
    gap: 16,
  },
  secureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(160, 120, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.28)',
    marginBottom: 8,
  },
  secureBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5de6ff',
  },
  secureBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d0bcff',
    letterSpacing: 0.7,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#e3e0f6',
    letterSpacing: -0.5,
  },
  formSubtitle: {
    fontSize: 13,
    color: '#cbc3d7',
    marginTop: 3,
  },
  fieldsGroup: {
    gap: 14,
  },
  fieldItem: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbc3d7',
  },
  fieldLabelHint: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5de6ff',
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(13, 13, 28, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.55)',
    paddingHorizontal: 12,
    height: 46,
  },
  inputBoxError: {
    borderColor: 'rgba(255, 180, 171, 0.65)',
    backgroundColor: 'rgba(147, 0, 10, 0.12)',
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#e3e0f6',
    fontSize: 14,
    paddingVertical: 8,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  domainSuffix: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#5de6ff',
    paddingLeft: 4,
  },
  errorBanner: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(147, 0, 10, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.35)',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#ffb4ab',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  rememberCheckWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#0d0d1c',
    borderWidth: 1,
    borderColor: 'rgba(149, 142, 160, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#a078ff',
    borderColor: '#a078ff',
  },
  rememberText: {
    fontSize: 12,
    color: '#cbc3d7',
  },
  forgotText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5de6ff',
  },
  submitBtnWrap: {
    marginTop: 4,
  },
  submitBtn: {
    height: 48,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(73, 68, 84, 0.45)',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#958ea0',
    letterSpacing: 1,
  },
  ssoGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  ssoBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(26, 26, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ssoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e3e0f6',
  },
  bottomActions: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(73, 68, 84, 0.3)',
    gap: 10,
    alignItems: 'center',
  },
  newToText: {
    fontSize: 12,
    color: '#cbc3d7',
    textAlign: 'center',
  },
  requestDemoLink: {
    color: '#5de6ff',
    fontWeight: '700',
  },
  guestBtn: {
    width: '100%',
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(13, 13, 28, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  guestBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbc3d7',
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#958ea0',
  },
  footerDot: {
    fontSize: 11,
    color: '#958ea0',
  },
  langToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 30, 46, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(73, 68, 84, 0.35)',
  },
  langToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#cbc3d7',
  },
});
