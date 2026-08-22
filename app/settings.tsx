import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Platform, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../constants/theme';
import { exportToCsv, exportToJson, restoreFromJson } from '../lib/backup';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleExportCSV() {
    setIsProcessing(true);
    try {
      const csvString = await exportToCsv(db);
      const filename = `nota-export-${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { UTI: 'public.comma-separated-values-text', dialogTitle: 'Export CSV' });
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Export Failed', 'Could not export data to CSV.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBackupJSON() {
    setIsProcessing(true);
    try {
      const jsonString = await exportToJson(db);
      const filename = `nota-backup-${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { UTI: 'public.json', dialogTitle: 'Save Backup' });
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not available on this device.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Backup Failed', 'Could not create JSON backup.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRestore() {
    Alert.alert(
      'Restore backup?',
      'Your current data will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: performRestore }
      ]
    );
  }

  async function performRestore() {
    setIsProcessing(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        setIsProcessing(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContents = await FileSystem.readAsStringAsync(fileUri);
      
      await restoreFromJson(db, fileContents);
      
      Alert.alert('Restore Complete', 'Your data has been successfully restored.', [
        { text: 'OK', onPress: () => router.replace('/') }
      ]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'The backup file is invalid or corrupted.';
      Alert.alert('Restore Failed', message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen 
        options={{
          title: 'Settings',
          headerShown: true,
          headerBackTitle: 'Back'
        }} 
      />
      
      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* PREFERENCES SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/merchant/rules')} disabled={isProcessing}>
            <View style={[styles.iconBox, { backgroundColor: '#8B5CF615' }]}>
              <Ionicons name="pricetags-outline" size={20} color="#8B5CF6" />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Merchant Rules</Text>
              <Text style={styles.actionSubtitle}>Manage your saved category rules</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* DATA MANAGEMENT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Backup</Text>
          <Text style={styles.sectionHint}>Manage, export, and protect your financial data.</Text>
          
          <TouchableOpacity style={[styles.actionRow, styles.actionRowDivider]} onPress={handleExportCSV} disabled={isProcessing}>
            <View style={[styles.iconBox, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Export to CSV</Text>
              <Text style={styles.actionSubtitle}>Spreadsheet-compatible format</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionRow, styles.actionRowDivider, { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]} onPress={handleBackupJSON} disabled={isProcessing}>
            <View style={[styles.iconBox, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="download-outline" size={20} color={colors.success} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Create Backup</Text>
              <Text style={styles.actionSubtitle}>Save a machine-readable backup</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionRow, styles.actionRowBottom]} onPress={handleRestore} disabled={isProcessing}>
            <View style={[styles.iconBox, { backgroundColor: colors.warning + '15' }]}>
              <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Restore from Backup</Text>
              <Text style={styles.actionSubtitle}>Replace current data with a backup</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ABOUT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Nota</Text>
          
          <View style={[styles.actionRow, styles.actionRowDivider]}>
            <View style={[styles.iconBox, { backgroundColor: colors.accent + '15' }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>Privacy First</Text>
              <Text style={styles.actionSubtitle}>Your data is stored 100% locally.</Text>
            </View>
          </View>

          <View style={[styles.actionRow, styles.actionRowBottom]}>
            <View style={[styles.iconBox, { backgroundColor: colors.textSecondary + '15' }]}>
              <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            </View>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>App Version</Text>
              <Text style={styles.actionSubtitle}>1.0.0 (Build 1)</Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  sectionHint: {
    ...typography.bodySecondary,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  actionRowDivider: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  actionRowBottom: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    ...typography.h4,
    marginBottom: 2,
  },
  actionSubtitle: {
    ...typography.caption,
  }
});
