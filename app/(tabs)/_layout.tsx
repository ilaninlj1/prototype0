import { Tabs } from 'expo-router';

import { BlindspotTabBar } from '@/components/tab-bar';

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <BlindspotTabBar {...props} />} screenOptions={{ headerShown: false, animation: 'shift' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: 'Play',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
