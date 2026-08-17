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
    title: "Couldn't analyze this document",
    subtitle: "We couldn't reach the scanner. Check your connection, then try again or enter the items yourself.",
    primaryLabel: 'Try Again',
  },
  processing: {
    icon: 'scan-outline',
    title: "Couldn't read this document",
    subtitle: 'The photo may be blurry, cropped, or not a supported receipt or payment proof. Retake it, or enter the details manually.',
    primaryLabel: 'Retake Photo',
  },
};

const PROCESSING_STEPS = ['Analyzing document…', 'Identifying items…', 'Calculating totals…'];

export default function ScanScreen() {
  const [mode, setMode] = useState<ScreenMode>('idle');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<GeminiVisionErrorKind>('processing');
  const [processingStep, setProcessingStep] = useState(0);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setMode((current) => (current === 'camera' || current === 'processing' ? 'idle' : current));
      };
    }, [])
  );

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'processing') {
      setProcessingStep(0);
      return;
    }
    const id = setInterval(() => {
      setProcessingStep((prev) => (prev + 1) % PROCESSING_STEPS.length);
    }, 2200);
    return () => clearInterval(id);
  }, [mode]);

  async function handleOpenCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          'Camera Permission Required',
          'NOTA needs camera access to scan receipts. You can still choose a photo from your gallery or enter items manually.'
        );
        return;
      }
    }
    setMode('camera');
  }

  async function handleTakePhoto() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, base64: false });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setMode('preview');
      }
    } catch {
      Alert.alert('Camera Error', 'Could not take a photo. Try again, or choose one from your gallery.');
    }
  }

  async function handlePickFromGallery() {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Photo Access Required',
          'NOTA needs access to your photos to upload a receipt or payment screenshot. You can still type the items manually.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        base64: false,
      });
      if (!result.canceled && result.assets[0].uri) {
        setPhotoUri(result.assets[0].uri);
        setMode('preview');
      }
    } catch {
      Alert.alert('Gallery Error', 'Could not open your photo library. Try again, or enter items manually.');
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
      if (cleanedItems.length === 0) {
        throw new GeminiVisionError('No valid items could be read from this document.', 'processing');
      }

      const editableItems: EditableReceiptItem[] = cleanedItems.map((item) => ({
        localId: randomUUID(),
        name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
        category: categorizeItem(item.name),
        lineTotal: item.lineTotal,
      }));

      setPhotoUri(null);
      setMode('idle');

      router.push({
        pathname: '/confirm',
        params: {
          items: JSON.stringify(editableItems),
          merchantName: result.merchantName,
          receiptTotal: result.receiptTotal === null ? '' : String(result.receiptTotal),
          tax: String(result.tax ?? 0),
          serviceCharge: String(result.serviceCharge ?? 0),
          discount: String(result.discount ?? 0),
          sourceType: result.sourceType,
          purchaseDate: result.purchaseDate ?? '',
          dateExtracted: result.dateExtracted ? '1' : '0',
          hadParsingIssues: result.hadParsingIssues ? '1' : '0',
        },
      });
    } catch (err) {
      abortControllerRef.current = null;
      if (err instanceof Error && err.name === 'AbortError') {
        setMode('idle');
        return;
      }
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
            <Text style={styles.processingText}>{PROCESSING_STEPS[processingStep]}</Text>
            <Text style={styles.processingHint}>This usually takes a few seconds</Text>
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
        <Text style={styles.title}>Scan a receipt</Text>
        <Text style={styles.subtitle}>
          Take a photo of a receipt or Indonesian payment proof. We extract the details — you review them before anything is saved.
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
    alignItems: 'center',
  },
  processingText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
  processingHint: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    marginTop: 6,
  },
});
