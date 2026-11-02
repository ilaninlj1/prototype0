import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView, Platform as DevicePlatform, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { isAdult, type Intent } from '@/lib/people';
import { ageWasOk, joinPeople, lockAge, markAgeOk, type JoinDetails } from '@/lib/people-api';
import { cleanHandle, nameLooksLikeContact, type Platform } from '@/lib/twins';

const INTENTS: { value: Intent; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'dating', label: 'Dating' },
  { value: 'either', label: 'Either' },
];
const PLATFORMS: { value: Platform | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'snapchat', label: 'Snapchat' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'discord', label: 'Discord' },
];

function Primary({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={[styles.primary, disabled && styles.disabled]}>
      <ThemedText style={styles.primaryText}>{label}</ThemedText>
    </PressableScale>
  );
}

export function YouForm({ initial, onSaved, buttonLabel = 'Start listening', disabled = false, onBusyChange }: {
  initial?: JoinDetails;
  onSaved: () => void | Promise<void>;
  buttonLabel?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [intent, setIntent] = useState<Intent | null>(initial?.intent ?? null);
  const [platform, setPlatform] = useState<Platform | null>(initial?.platform ?? null);
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const badName = nameLooksLikeContact(name);
  const cleaned = platform ? cleanHandle(handle, platform) : null;
  const badHandle = platform !== null && !cleaned;
  const valid = !!name.trim() && !badName && !!intent && !badHandle;

  async function save() {
    if (!valid || !intent || busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    setNote('');
    try {
      if (await joinPeople({ name: name.trim(), intent, platform, handle: cleaned })) await onSaved();
      else setNote("Couldn't join just now. Try again.");
    } catch {
      setNote("Couldn't join just now. Try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <View style={styles.question}>
      <ThemedText type="title" style={styles.title}>Last bit</ThemedText>
      <View style={styles.field}>
        <ThemedText style={styles.label}>First name</ThemedText>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={30}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="First name"
          style={Ui.input}
          editable={!busy && !disabled}
        />
        {badName && <ThemedText style={styles.error}>Just a first name. No handles or links.</ThemedText>}
      </View>
      <View style={styles.field}>
        <ThemedText style={styles.label}>Open to</ThemedText>
        <View style={styles.pills}>
          {INTENTS.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setIntent(item.value)}
              disabled={busy || disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: intent === item.value }}
              style={[styles.pill, intent === item.value && styles.selected]}>
              <ThemedText style={intent === item.value ? styles.selectedText : styles.label}>{item.label}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <ThemedText style={styles.label}>A handle, if you want</ThemedText>
        <View style={styles.pills}>
          {PLATFORMS.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => setPlatform(item.value)}
              disabled={busy || disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: platform === item.value }}
              style={[styles.pill, platform === item.value && styles.selected]}>
              <ThemedText style={platform === item.value ? styles.selectedText : styles.label}>{item.label}</ThemedText>
            </Pressable>
          ))}
        </View>
        {platform && (
          <TextInput
            value={handle}
            onChangeText={setHandle}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Handle"
            placeholder="Username"
            placeholderTextColor={Colors.textSecondary}
            style={Ui.input}
            editable={!busy && !disabled}
          />
        )}
        {badHandle && !!handle && <ThemedText style={styles.error}>That handle doesn&apos;t look right.</ThemedText>}
        <ThemedText style={styles.dim}>Only someone who waves back sees it.</ThemedText>
      </View>
      {!!note && <ThemedText style={styles.error}>{note}</ThemedText>}
      <Primary label={buttonLabel} onPress={save} disabled={!valid || busy || disabled} />
    </View>
  );
}

export function JoinFlow({ onJoined, onLocked }: { onJoined: () => void | Promise<void>; onLocked: () => void }) {
  const [step, setStep] = useState<'hello' | 'age' | 'consent' | 'you'>('hello');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const validDate = /^\d{1,2}$/.test(month) && +month >= 1 && +month <= 12 && /^\d{4}$/.test(year);

  async function advance() {
    if (busy) return;
    setBusy(true);
    setNote('');
    try {
      if (step === 'hello') setStep((await ageWasOk()) ? 'consent' : 'age');
      else if (validDate) {
        if (!isAdult(+year, +month, new Date())) {
          await lockAge();
          onLocked();
        } else {
          await markAgeOk();
          setMonth('');
          setYear('');
          setStep('consent');
        }
      }
    } catch {
      setNote("Couldn't continue just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={DevicePlatform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {step !== 'hello' && (
          <Pressable
            onPress={() => { setNote(''); setStep(step === 'you' ? 'consent' : 'hello'); }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}>
            <Ionicons name="chevron-back" size={26} color={Colors.text} />
          </Pressable>
        )}
        {step === 'hello' && (
          <View style={styles.question}>
            <ThemedText type="title" style={styles.title}>You swipe the song, not the person.</ThemedText>
            <ThemedText style={styles.copy}>Every song here is one someone else loved.</ThemedText>
            <ThemedText style={styles.copy}>When your hearts keep landing on the same songs, you&apos;ll meet.</ThemedText>
            <ThemedText style={styles.copy}>No photos. No chat. If you both wave, you swap one handle.</ThemedText>
            <Primary label="Start" onPress={advance} disabled={busy} />
          </View>
        )}
        {step === 'age' && (
          <View style={styles.question}>
            <ThemedText type="title" style={styles.title}>When were you born?</ThemedText>
            <ThemedText style={styles.dim}>This stays on your phone.</ThemedText>
            <View style={styles.date}>
              <TextInput
                value={month}
                onChangeText={(value) => setMonth(value.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="Month"
                accessibilityLabel="Month"
                placeholderTextColor={Colors.textSecondary}
                style={[Ui.input, styles.fill]}
                editable={!busy}
              />
              <TextInput
                value={year}
                onChangeText={(value) => setYear(value.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="Year"
                accessibilityLabel="Year"
                placeholderTextColor={Colors.textSecondary}
                style={[Ui.input, styles.fill]}
                editable={!busy}
              />
            </View>
            <Primary label="Continue" onPress={advance} disabled={!validDate || busy} />
          </View>
        )}
        {step === 'consent' && (
          <View style={styles.question}>
            <ThemedText type="title" style={styles.title}>What leaves your phone</ThemedText>
            <ThemedText style={styles.consentRow}>
              Your hearted songs, and the songs you pass on here, so we can compare them with other people&apos;s.
            </ThemedText>
            <ThemedText style={styles.consentRow}>
              A first name and a taste print, only to people you&apos;re in tune with.
            </ThemedText>
            <ThemedText style={styles.consentRow}>A handle, if you add one, only to someone who waves back.</ThemedText>
            <ThemedText style={styles.dim}>
              Your birth date stays here. You can leave anytime, and that deletes all of it from our server.
            </ThemedText>
            <Primary label="I agree" onPress={() => setStep('you')} />
            <Pressable onPress={() => setStep('hello')} accessibilityRole="button" style={styles.secondary}>
              <ThemedText style={styles.dim}>Not now</ThemedText>
            </Pressable>
          </View>
        )}
        {step === 'you' && <YouForm onSaved={onJoined} onBusyChange={setBusy} />}
        {!!note && <ThemedText style={styles.error}>{note}</ThemedText>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flexGrow: 1, padding: Spacing.xl, gap: Spacing.lg },
  question: { gap: Spacing.xl },
  title: { fontSize: 36, lineHeight: 40 },
  copy: { fontSize: 20, lineHeight: 28 },
  dim: { color: Colors.textSecondary },
  field: { gap: Spacing.sm },
  label: { ...Ui.label },
  date: { flexDirection: 'row', gap: Spacing.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: { ...Ui.outlineButton, borderRadius: Radius.round },
  selected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  selectedText: { ...Ui.label, color: Colors.accentText },
  primary: { ...Ui.outlineButton, minHeight: 52, backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.accentText },
  disabled: { opacity: 0.4 },
  back: { ...Ui.textButton, alignSelf: 'flex-start' },
  secondary: { ...Ui.textButton, alignItems: 'center' },
  consentRow: { fontSize: 18, lineHeight: 26, paddingBottom: Spacing.lg, borderBottomWidth: 1, borderColor: Colors.rule },
  error: { color: Colors.destructive },
});
