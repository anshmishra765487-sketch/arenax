import React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function Screen({ className, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={["top"]}>
      <View className={cn("flex-1 px-4", className)} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </Text>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "outline" | "danger" | "ghost";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-500 active:bg-brand-600",
  outline: "border border-slate-700 bg-transparent",
  danger: "bg-red-500 active:bg-red-600",
  ghost: "bg-transparent",
};

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  className,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      className={cn(
        "h-12 w-full flex-row items-center justify-center rounded-xl px-4",
        buttonVariants[variant],
        isDisabled && "opacity-50",
        className,
      )}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-base font-semibold text-white">{title}</Text>
      )}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <View className="mb-3">
      {label ? <Text className="mb-1 ml-1 text-sm text-slate-300">{label}</Text> : null}
      <TextInput
        placeholderTextColor="#64748B"
        className={cn(
          "min-h-12 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white",
          error ? "border-red-500" : null,
          className,
        )}
        {...rest}
      />
      {error ? <Text className="ml-1 mt-1 text-xs text-red-400">{error}</Text> : null}
      {!error && hint ? <Text className="ml-1 mt-1 text-xs text-slate-500">{hint}</Text> : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Cards / badges / chips                                                     */
/* -------------------------------------------------------------------------- */

export function Card({ className, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("rounded-2xl border border-slate-800 bg-slate-900/80 p-4", className)}
      {...rest}
    >
      {children}
    </View>
  );
}

const badgeStyles: Record<string, string> = {
  upcoming: "border-sky-500/40 bg-sky-500/15 text-sky-300",
  live: "border-red-500/40 bg-red-500/15 text-red-300",
  completed: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  cancelled: "border-slate-500/40 bg-slate-500/15 text-slate-400",
  confirmed: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  waitlisted: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  default: "border-slate-600/40 bg-slate-600/15 text-slate-300",
};

export function Badge({ label, status }: { label?: string; status?: string }) {
  const style = badgeStyles[status ?? label ?? ""] ?? badgeStyles.default;
  return (
    <View className={cn("rounded-full border px-2.5 py-1", style.split(" ").slice(0, 2).join(" "))}>
      <Text className={cn("text-[10px] font-bold uppercase tracking-wide", style.split(" ")[2])}>
        {label ?? status}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "mr-2 rounded-full border px-4 py-2",
        active
          ? "border-brand-400 bg-brand-500/20"
          : "border-slate-700 bg-slate-900/60",
      )}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          active ? "text-brand-100" : "text-slate-400",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function Spinner({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <ActivityIndicator color="#818CF8" size="large" />
      {label ? <Text className="mt-3 text-sm text-slate-400">{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-dashed border-slate-800 px-6 py-12">
      <Text className="text-center text-base font-semibold text-slate-200">{title}</Text>
      {description ? (
        <Text className="mt-2 text-center text-sm leading-5 text-slate-500">{description}</Text>
      ) : null}
    </View>
  );
}
