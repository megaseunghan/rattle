module.exports = function (api) {
  const isTest = api.env('test'); // api.env()가 캐싱을 자동 처리
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // Jest 환경에서 Reanimated 4의 worklets babel 플러그인 비활성화
          reanimated: !isTest,
        },
      ],
    ],
  };
};
