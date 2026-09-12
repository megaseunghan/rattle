import { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '../../constants/colors';

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
const READY_TIMEOUT_MS = 6000;

export interface KakaoMapRef {
  moveToCoord: (lat: number, lng: number) => void;
}

interface Props {
  initialLat: number;
  initialLng: number;
  /** 출퇴근 허용 반경(m) — 지정하면 기준점 주위에 점선 원으로 표시된다 */
  radiusM?: number;
  onPinMoved?: (lat: number, lng: number) => void;
}

function buildHtml(lat: number, lng: number, radiusM: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%;overflow:hidden}
  </style>
</head>
<body>
<div id="map"></div>
<script>
var map, marker, circle;

function send(obj) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
}

window.onerror = function(message, source, lineno, colno, error) {
  send({ type: 'error', message: String(message) });
  return true;
};

function init(lat, lng, radiusM) {
  if (typeof kakao === 'undefined' || !kakao.maps) {
    send({ type: 'error', message: 'kakao SDK를 불러오지 못했습니다 (키/도메인 확인 필요)' });
    return;
  }
  var pos = new kakao.maps.LatLng(lat, lng);
  map = new kakao.maps.Map(document.getElementById('map'), { center: pos, level: 3 });
  marker = new kakao.maps.Marker({ position: pos, draggable: true });
  marker.setMap(map);
  circle = new kakao.maps.Circle({
    center: pos,
    radius: radiusM,
    strokeWeight: 2,
    strokeColor: '#3182F6',
    strokeOpacity: 0.9,
    strokeStyle: 'dash',
    fillColor: '#3182F6',
    fillOpacity: 0.12,
  });
  circle.setMap(map);
  kakao.maps.event.addListener(marker, 'dragend', function() {
    var p = marker.getPosition();
    circle.setPosition(p);
    send({ type: 'dragend', lat: p.getLat(), lng: p.getLng() });
  });
  send({ type: 'ready' });
}

function moveTo(lat, lng) {
  var pos = new kakao.maps.LatLng(lat, lng);
  if (marker) marker.setPosition(pos);
  if (circle) circle.setPosition(pos);
  if (map) map.panTo(pos);
}

function setRadius(radiusM) {
  if (circle) circle.setRadius(radiusM);
}

function handleMsg(e) {
  try {
    var d = JSON.parse(e.data);
    if (d.type === 'moveTo') moveTo(d.lat, d.lng);
    if (d.type === 'setRadius') setRadius(d.radiusM);
  } catch(err) {}
}
window.addEventListener('message', handleMsg);
document.addEventListener('message', handleMsg);

window.__kakaoSdkLoaded = function() {
  if (typeof kakao === 'undefined' || !kakao.maps) {
    send({ type: 'error', message: 'SDK 파일은 받았지만 kakao 객체가 없습니다 (appkey 오류 가능성)' });
    return;
  }
  kakao.maps.load(function() { init(${lat}, ${lng}, ${radiusM}); });
};
window.__kakaoSdkError = function() {
  send({ type: 'error', message: 'SDK 스크립트를 불러오지 못했습니다 (네트워크 차단 또는 도메인 미등록)' });
};
</script>
<script
  src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&libraries=services&autoload=false"
  onload="window.__kakaoSdkLoaded()"
  onerror="window.__kakaoSdkError()"
></script>
</body>
</html>`;
}

const KakaoMap = forwardRef<KakaoMapRef, Props>(({ initialLat, initialLng, radiusM = 40, onPinMoved }, ref) => {
  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(JS_KEY ? 'loading' : 'error');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    JS_KEY ? null : 'EXPO_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다. .env 확인 후 앱을 다시 빌드해주세요.',
  );

  // 초기 좌표가 바뀔 때만 새로 만든다 — radiusM은 postMessage(setRadius)로만 갱신해서
  // 부모 화면(매장정보)에서 슬라이더를 움직이거나 다른 필드에 타이핑할 때마다 source가
  // 새 객체로 바뀌어 WebView가 매번 처음부터 다시 로드되는 걸 막는다.
  const initialRadiusRef = useRef(radiusM);
  const html = useMemo(
    () => buildHtml(initialLat, initialLng, initialRadiusRef.current),
    [initialLat, initialLng],
  );
  // https로 둬야 카카오 SDK가 내부적으로 불러오는 지도 엔진 스크립트(t1.daumcdn.net)도
  // 같은 프로토콜(https)로 요청된다. http로 두면 그 내부 요청이 평문(HTTP)으로 나가서
  // iOS ATS/Android cleartext 차단 정책에 걸려 조용히 실패한다.
  const source = useMemo(() => ({ html, baseUrl: 'https://localhost' }), [html]);

  useImperativeHandle(ref, () => ({
    moveToCoord(lat: number, lng: number) {
      webViewRef.current?.postMessage(JSON.stringify({ type: 'moveTo', lat, lng }));
    },
  }));

  useEffect(() => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'setRadius', radiusM }));
  }, [radiusM]);

  useEffect(() => {
    if (!JS_KEY) return;
    const timeout = setTimeout(() => {
      setStatus(prev => {
        if (prev !== 'loading') return prev;
        setErrorMessage('지도 로딩이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.');
        return 'error';
      });
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [initialLat, initialLng]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'ready') {
        setStatus('ready');
      } else if (data.type === 'error') {
        setStatus('error');
        setErrorMessage(data.message ?? '지도를 불러오지 못했습니다.');
      } else if ((data.type === 'dragend' || data.type === 'moved') && onPinMoved) {
        onPinMoved(data.lat, data.lng);
      }
    } catch {}
  }

  return (
    <View style={styles.container}>
      {JS_KEY && (
        <WebView
          ref={webViewRef}
          source={source}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mixedContentMode="always"
          allowsFullscreenVideo={false}
          onMessage={onMessage}
          onError={(e) => { setStatus('error'); setErrorMessage(`WebView 오류: ${e.nativeEvent.description}`); }}
          onHttpError={(e) => { setStatus('error'); setErrorMessage(`네트워크 오류 (${e.nativeEvent.statusCode})`); }}
          scrollEnabled={false}
          style={styles.webview}
        />
      )}
      {status === 'loading' && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingText}>지도 불러오는 중…</Text>
        </View>
      )}
      {status === 'error' && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}
    </View>
  );
});

export default KakaoMap;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray100 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingText: { fontSize: 12, fontWeight: '500', color: Colors.gray400 },
  errorOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', padding: 20,
    backgroundColor: Colors.gray50,
  },
  errorText: { fontSize: 12, fontWeight: '500', color: Colors.gray500, textAlign: 'center', lineHeight: 18 },
});
