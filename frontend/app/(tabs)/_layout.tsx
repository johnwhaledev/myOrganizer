import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { Fonts } from '../../constants/Fonts';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function HomeTitle() {
  return (
    <Text style={{ fontSize: 18, fontFamily: Fonts.mono.bold, color: Colors.textPrimary }}>
      <Text style={{ color: Colors.accent }}>my</Text>Organizer
    </Text>
  );
}

const TAB_SCREENS = [
  { name: 'home',            label: 'Home',       icon: 'home-outline' as IconName,    title: undefined },
  { name: 'space-saver',     label: 'Saver',      icon: 'copy-outline' as IconName,    title: 'Space Saver' },
  { name: 'smart-organizer', label: 'Organizer',  icon: 'albums-outline' as IconName,  title: 'Smart Organizer' },
  { name: 'brain',           label: 'Brain',      icon: 'bulb-outline' as IconName,    title: 'The Brain' },
  { name: 'settings',        label: 'Settings',   icon: 'settings-outline' as IconName, title: 'Settings' },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 10 : 8);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { fontFamily: Fonts.sans.medium, fontSize: 17, color: Colors.textPrimary },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: Colors.background,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: bottomInset,
          paddingTop: 6,
          height: 58 + bottomInset,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontFamily: Fonts.mono.bold },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {TAB_SCREENS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarLabel: tab.label,
            headerTitle: tab.name === 'home' ? () => <HomeTitle /> : tab.title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
