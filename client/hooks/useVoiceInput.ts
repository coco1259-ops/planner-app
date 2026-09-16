import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { createFormDataFile } from '@/utils';

const API_BASE = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? '').replace(/\/$/, '');

/**
 * 语音输入 Hook：录音 → 上传后端 ASR → 返回识别文本
 */
export function useVoiceInput(onResult?: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const start = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请授予麦克风录音权限');
      return;
    }
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => { /* ignore */ });
      recordingRef.current = null;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error('录音失败', e);
    }
  };

  const stop = async () => {
    const rec = recordingRef.current;
    if (!rec) {
      setRecording(false);
      return;
    }
    setRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return;
      setProcessing(true);
      const formData = new FormData();
      formData.append('file', (await createFormDataFile(uri, 'voice.m4a', 'audio/mp4')) as any);
      const resp = await fetch(`${API_BASE}/api/v1/voice/asr`, { method: 'POST', body: formData });
      const json = await resp.json();
      if (json?.text) {
        onResult?.(json.text);
      } else {
        Alert.alert('识别失败', '未识别到语音内容');
      }
    } catch (e) {
      console.error('识别失败', e);
      Alert.alert('识别失败', '语音识别出错，请重试');
    } finally {
      setProcessing(false);
    }
  };

  return { recording, processing, start, stop };
}