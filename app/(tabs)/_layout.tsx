import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius } from '../../constants/theme';
function TabIcon({ name, focused, isScan = false, color }: { name: any; focused: boolean; isScan?: boolean; color: string }) {
  if (isScan) {
    return (
      <View
        style={{
          width: 44,
          height: 32,
          borderRadius: radius.pill,
          backgroundColor: focused ? colors.primary : colors.accentMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={name} size={18} color={focused ? colors.textOnPrimary : colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ opacity: focused ? 1 : 0.7 }}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // Clean iOS immersive experience (Large Title in body)
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarLabelStyle: {
          fontFamily: 'Manrope_700Bold',
          fontSize: 10,
          marginTop: 2,
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'scan' : 'scan-outline'} focused={focused} isScan color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="forecast"
        options={{
          title: 'Forecast',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'stats-chart' : 'stats-chart-outline'} focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
