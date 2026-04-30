import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScAgvrevASsUllyf6o5TiyxxtMGLiFdUl3Vzk83gaQbLiysrA/formResponse';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { name, address, businessNumber, ownerPhone } = await req.json();

    const merchantInfo = [name, address, businessNumber, ownerPhone].join(', ');

    const body = new URLSearchParams({
      'entry.263323575': 'skud11311@gmail.com',
      'entry.610579560': '010-2512-2157',
      'entry.51284767': 'Open API',
      'entry.1040582165': 'rattle-recipe-stock',
      'entry.2010669006': 'Rattle',
      'entry.1674845743': '라이브 가맹점 (가맹점 대표자에게 가맹점 정보 제공 동의(녹취)를 받은 후 연결해드립니다.)',
      'entry.1639848356': merchantInfo,
    });

    // 서버사이드 호출이므로 CORS 없이 redirect 응답을 정상 수신
    const res = await fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'follow',
    });

    if (!res.ok && res.status !== 0) {
      return new Response(
        JSON.stringify({ error: `Google Forms 제출 실패 (status: ${res.status})` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : '알 수 없는 오류' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
