const { chromium } = require('playwright');
const path = require('path');

async function startRecording() {
  console.log('🎙️ 사용자 행동 학습 모드(클릭 추적) 시작...');
  
  const userDataDir = path.join(__dirname, 'user_data');
  const context = await chromium.launchPersistentContext(userDataDir, { 
    headless: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();

  // 클릭 이벤트 발생 시 Node.js 환경(터미널)으로 데이터를 보내는 연결 통로 생성
  await page.exposeFunction('logClick', (clickData) => {
    console.log(`\n🎯 [사용자 클릭 감지]`);
    console.log(`- 태그: ${clickData.tagName}`);
    if (clickData.id) console.log(`- ID: #${clickData.id}`);
    if (clickData.className) console.log(`- 클래스: .${clickData.className}`);
    if (clickData.text) console.log(`- 텍스트: "${clickData.text}"`);
    if (clickData.placeholder) console.log(`- 플레이스홀더: "${clickData.placeholder}"`);
    console.log(`-----------------------------------`);
  });

  // 모든 페이지 전환이나 로딩 후에 클릭 추적 스크립트를 주입하도록 설정
  await page.addInitScript(() => {
    document.addEventListener('click', (e) => {
      let target = e.target;
      // SVG나 아이콘을 클릭했을 때 상위 버튼을 찾기 위한 로직
      while (target && target.tagName !== 'BUTTON' && target.tagName !== 'A' && target.tagName !== 'INPUT' && target.tagName !== 'HTML') {
        target = target.parentElement;
      }
      if (!target || target.tagName === 'HTML') target = e.target;

      const clickData = {
        tagName: target.tagName,
        id: target.id || '',
        className: target.className && typeof target.className === 'string' ? target.className : '',
        text: (target.innerText || target.value || '').trim().substring(0, 50),
        placeholder: target.placeholder || ''
      };
      
      // Node.js 환경으로 전송
      window.logClick(clickData).catch(() => {});
    }, true); // 캡처링 단계에서 이벤트 가로채기
  });

  try {
    const inboundUrl = 'https://wing.coupang.com/tenants/rfm-inbound/inbound/list';
    console.log(`📦 쿠팡 입고 관리 페이지 접속 중...`);
    await page.goto(inboundUrl, { waitUntil: 'domcontentloaded' });
    
    console.log('\n✅ 준비 완료! 브라우저 창에서 다음 과정을 천천히 한 번 진행해 주세요.');
    console.log('1. [입고 생성] 버튼 누르기');
    console.log('2. 상품 검색하기');
    console.log('3. 수량 입력하기');
    console.log('4. 추가 등 필요한 작업 진행\n');
    console.log('터미널에 클릭한 정보가 실시간으로 기록됩니다. (기록이 끝나면 터미널에서 Ctrl+C를 눌러주세요.)\n');

    // 스크립트가 종료되지 않고 계속 대기하도록 무한 대기
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 추적 중 오류 발생:', error.message);
  }
}

startRecording();
