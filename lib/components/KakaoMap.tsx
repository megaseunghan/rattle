import { useRef, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

export interface KakaoMapRef {
  moveToCoord: (lat: number, lng: number) => void;
}

interface Props {
  initialLat: number;
  initialLng: number;
  onPinMoved?: (lat: number, lng: number) => void;
}

function buildHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
  <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&libraries=services"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body,#map{width:100%;height:100%;overflow:hidden}
  </style>
</head>
<body>
<div id="map"></div>
<script>
var map, marker;

function init(lat, lng) {
  var pos = new kakao.maps.LatLng(lat, lng);
  map = new kakao.maps.Map(document.getElementById('map'), {
    center: pos, level: 3
  });
  marker = new kakao.maps.Marker({ position: pos, draggable: true });
  marker.setMap(map);
  kakao.maps.event.addListener(marker, 'dragend', function() {
    var p = marker.getPosition();
    send({ type: 'dragend', lat: p.getLat(), lng: p.getLng() });
  });
}

function moveTo(lat, lng) {
  var pos = new kakao.maps.LatLng(lat, lng);
  if (marker) marker.setPosition(pos);
  if (map) map.panTo(pos);
  send({ type: 'moved', lat: lat, lng: lng });
}

function send(obj) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
}

function handleMsg(e) {
  try {
    var d = JSON.parse(e.data);
    if (d.type === 'moveTo') moveTo(d.lat, d.lng);
  } catch(err) {}
}
window.addEventListener('message', handleMsg);
document.addEventListener('message', handleMsg);

init(${lat}, ${lng});
</script>
</body>
</html>`;
}

const KakaoMap = forwardRef<KakaoMapRef, Props>(({ initialLat, initialLng, onPinMoved }, ref) => {
  const webViewRef = useRef<WebView>(null);

  useImperativeHandle(ref, () => ({
    moveToCoord(lat: number, lng: number) {
      webViewRef.current?.postMessage(JSON.stringify({ type: 'moveTo', lat, lng }));
    },
  }));

  function onMessage(e: WebViewMessageEvent) {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if ((data.type === 'dragend' || data.type === 'moved') && onPinMoved) {
        onPinMoved(data.lat, data.lng);
      }
    } catch {}
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: buildHtml(initialLat, initialLng), baseUrl: 'http://localhost' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        onMessage={onMessage}
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
});

export default KakaoMap;

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
