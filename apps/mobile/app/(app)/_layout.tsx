import { Redirect, Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../../src/features/auth/useAuth";

export default function AppLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#020617" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="tournaments" />
      <Stack.Screen name="tournament/[id]" />
      <Stack.Screen name="match/[id]" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="teams" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="leaderboards" />
      <Stack.Screen name="achievements" />
      <Stack.Screen name="clips" />
      <Stack.Screen name="scrims" />
      <Stack.Screen name="vip" />
      <Stack.Screen name="legal" />
    </Stack>
  );
}
