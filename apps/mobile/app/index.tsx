import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../src/features/auth/useAuth";

/** Boot screen: routes to the app or the auth flow once the session is restored. */
export default function IndexScreen() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  return <Redirect href={session ? "/tournaments" : "/login"} />;
}
