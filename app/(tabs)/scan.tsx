import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert, StatusBar } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { extractDocument, GeminiVisionError, GeminiVisionErrorKind } from '../../lib/geminiVision';
import { categorizeItem } from '../../lib/categorize';
import { filterNonExpenseItems } from '../../lib/filterReceiptItems';
import { colors, spacing, radius } from '../../constants/theme';
import Button from '../../components/Button';
import StateView from '../../components/StateView';
import { EditableReceiptItem } from '../../types/receipt';

type ScreenMode = 'idle' | 'camera' | 'preview' | 'processing' | 'error';

interface ErrorCopy {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  primaryLabel: string;
}

const ERROR_COPY: Record<GeminiVisionErrorKind, ErrorCopy> = {
  network: {
    icon: 'cloud-offline-outline',
    title: "Couldn't analyze receipt",
    subtitle: 'We couldn\u2019t process this receipt. Check your connection and try again.',
    primaryLabel: 'Try Again',
  },
  processing: {
    icon: 'scan-outline',
    title: "Couldn't read this document",
    subtitle: 'The photo may be blurry, unclear, or not a supported document. Try taking a new photo.',
    primaryLabel: 'Retake Photo',
  },
};

export default function ScanScreen() {
  const [mode, setMode] = useState<ScreenMode>('idle');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<GeminiVisionErrorKind>('processing');
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Reset screen mode to 'idle' whenever user navigates back to Scan screen
  useFocusEffect(
    useCallback(() => {
      setMode((prev) => (prev === 'processing' ? 'idle' : prev));
    }, [])
  );

  useEffect(() => {
    return () => {
      // Abort any ongoing network request when the screen unmounts
      abortControllerRef.current?.abort();
    };
  }, []);

  async function handleOpenCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission Required', 'NOTA needs camera access to scan receipts.');
        return;
      }
    }
    setMode('camera');
  }

  async function handleTakePhoto() {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 1, base64: false });
    if (photo?.uri) {
      setPhotoUri(photo.uri);
      setMode('preview');
    }
  }

  async function handlePickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      base64: false,
    });
    if (!result.canceled && result.assets[0].uri) {
      setPhotoUri(result.assets[0].uri);
      setMode('preview');
    }
  }

  function handleRetake() {
    setPhotoUri(null);
    setMode('idle');
  }

  function handleEnterManually() {
    router.push('/confirm');
  }

  async function handleProceed() {
    if (!photoUri) return;
    setMode('processing');
    
    abortControllerRef.current = new AbortController();
    
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipulated.base64) {
        throw new Error('Image manipulation failed to output base64');
      }

      const result = await extractDocument(manipulated.base64, abortControllerRef.current.signal);
      abortControllerRef.current = null;
      
      const cleanedItems = filterNonExpenseItems(result.items);
      const editableItems: EditableReceiptItem[] = cleanedItems.map((item) => ({
        localId: randomUUID(),
        name: item.name,
        price: Math.round(item.price / item.quantity),
        quantity: item.quantity,
        category: categorizeItem(item.name),
        lineTotal: item.price,
      }));
      
      setPhotoUri(null);
      setMode('idle');

      router.push({
        pathname: '/confirm',
        params: {
          items: JSON.stringify(editableItems),
          merchantName: result.merchantName,
          receiptTotal: String(result.receiptTotal ?? 0),
          tax: String(result.tax ?? 0),
          serviceCharge: String(result.serviceCharge ?? 0),
          sourceType: result.sourceType,
        },
      });
    } catch (err) {
      abortControllerRef.current = null;
      const kind = err instanceof GeminiVisionError ? err.kind : 'network';
      setErrorKind(kind);
      setMode('error');
    }
  }

  function handleErrorPrimaryPress() {
    if (errorKind === 'network') {
      handleProceed();
    } else {
      setPhotoUri(null);
      setMode('idle');
    }
  }

  if (mode === 'camera') {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" />
        <CameraView ref={cameraRef} style={styles.flex} facing="back" />
        <View style={styles.captureBar}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleTakePhoto}
            accessibilityLabel="Capture photo"
            accessibilityRole="button"
          />
        </View>
      </View>
    );
  }

  if (mode === 'processing') {
    return (
      <View style={styles.processingContainer}>
        <StatusBar barStyle="light-content" />
        {photoUri && <Image source={{ uri: photoUri }} style={styles.processingThumbnail} resizeMode="cover" />}
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <Text style={styles.processingText}>Analyzing document...</Text>
          </View>
        </View>
      </View>
    );
  }

  if (mode === 'error') {
    const copy = ERROR_COPY[errorKind];
    return (
      <StateView
        icon={copy.icon}
        iconTone="error"
        title={copy.title}
        subtitle={copy.subtitle}
        primaryLabel={copy.primaryLabel}
        onPrimaryPress={handleErrorPrimaryPress}
        secondaryLabel="Enter manually"
        onSecondaryPress={handleEnterManually}
      />
    );
  }

  if (mode === 'preview' && photoUri) {
    return (
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" />
        <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
        <View style={styles.previewActions}>
          <Button label="Retake" variant="secondary" onPress={handleRetake} style={styles.previewButton} />
          <Button label="Continue" variant="primary" onPress={handleProceed} style={styles.previewButton} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.idleContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <View style={styles.contentCard}>
        <View style={styles.iconCircle}>
          <Ionicons name="document-text-outline" size={32} color="#0F172A" />
        </View>
        <Text style={styles.title}>Add Transaction</Text>
        <Text style={styles.subtitle}>
          Take a photo of your receipt or upload a transfer/e-wallet screenshot.
        </Text>

        <View style={styles.buttonGroup}>
          <Button label="Open Camera" variant="primary" onPress={handleOpenCamera} style={styles.ctaButton} />
          <Button label="Choose from Gallery" variant="secondary" onPress={handlePickFromGallery} style={styles.ctaButton} />
        </View>

        <TouchableOpacity onPress={handleEnterManually} style={styles.manualLink} accessibilityRole="button">
          <Text style={styles.manualLinkText}>Enter manually instead</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FAFAFA',
  },
  contentCard: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 22,
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  buttonGroup: {
    width: '100%',
    gap: spacing.sm,
  },
  ctaButton: {
    height: 52,
    borderRadius: radius.md,
  },
  manualLink: {
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualLinkText: {
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  captureBar: { position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#ccc',
  },
  preview: { flex: 1, backgroundColor: '#000' },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewButton: { flex: 1 },
  processingContainer: { flex: 1, backgroundColor: '#000' },
  processingThumbnail: { flex: 1, opacity: 0.35 },
  processingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  processingCard: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  processingText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
});
