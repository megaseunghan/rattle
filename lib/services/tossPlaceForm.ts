const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScAgvrevASsUllyf6o5TiyxxtMGLiFdUl3Vzk83gaQbLiysrA/formResponse';

interface StoreApplyInfo {
  name: string;
  address: string;
  businessNumber: string;
  ownerPhone: string;
}

export async function submitTossPlaceApplication(info: StoreApplyInfo): Promise<void> {
  const merchantInfo = [info.name, info.address, info.businessNumber, info.ownerPhone].join(', ');

  const body = new URLSearchParams({
    'entry.263323575': 'skud11311@gmail.com',
    'entry.610579560': '010-2512-2157',
    'entry.51284767': 'Open API만',
    'entry.1040582165': 'rattle-recipe-stock',
    'entry.2010669006': 'Rattle',
    'entry.1674845743': '라이브 가맹점',
    'entry.1639848356': merchantInfo,
  });

  // Google Forms는 CORS 없이 제출 가능 (redirect 응답 무시)
  await fetch(FORM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  }).catch(() => {
    // redirect로 인한 네트워크 에러는 무시 — 제출은 성공
  });
}
