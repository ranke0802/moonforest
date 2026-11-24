const strings = {
  ko: ['승마', '하마', '취소', '말을 얻었습니다. 승마 버튼이나 H를 누르세요.', '말이 준비됐습니다. 승마 버튼이나 H를 누르세요.', '말을 저장할 수 없습니다.', '승마 자세를 준비하지 못했습니다. 다시 시도해 주세요.', '말을 불러오지 못했습니다. 다시 시도해 주세요.'],
  en: ['Mount', 'Dismount', 'Cancel', 'Horse acquired. Select Mount or press H.', 'Your horse is ready. Select Mount or press H.', 'Your horse could not be saved.', 'The riding pose could not be prepared. Please try again.', 'Your horse could not be loaded. Please try again.'],
  ja: ['乗馬', '下馬', 'キャンセル', '馬を入手しました。乗馬ボタンかHキーを押してください。', '馬の準備ができました。乗馬ボタンかHキーを押してください。', '馬を保存できませんでした。', '騎乗姿勢を準備できませんでした。もう一度お試しください。', '馬を読み込めませんでした。もう一度お試しください。'],
  zh: ['上马', '下马', '取消', '已获得坐骑。点按「上马」或按 H 键骑乘。', '坐骑已就绪。点按「上马」或按 H 键骑乘。', '无法保存坐骑。', '无法准备骑乘姿势，请重试。', '无法加载坐骑，请重试。'],
  vi: ['Lên ngựa', 'Xuống ngựa', 'Hủy', 'Bạn đã nhận được ngựa. Chọn Lên ngựa hoặc nhấn H.', 'Ngựa đã sẵn sàng. Chọn Lên ngựa hoặc nhấn H.', 'Không thể lưu ngựa.', 'Không thể chuẩn bị tư thế cưỡi ngựa. Vui lòng thử lại.', 'Không thể tải ngựa. Vui lòng thử lại.']
};
const feedback={
  ko:['말에 올랐습니다.','말에서 내렸습니다.'],
  en:['Mounted.','Dismounted.'],
  ja:['馬に乗りました。','馬から降りました。'],
  zh:['已上马。','已下马。'],
  vi:['Đã lên ngựa.','Đã xuống ngựa.']
};
const labels={};
for(const [lang,values] of Object.entries(strings)){
 const [mount,dismount,cancel,acquired,ready,saveError,poseError,loadError]=values;
 const [mounted,dismounted]=feedback[lang];
 labels[lang]={mount,dismount,cancel,acquired,ready,saveError,poseError,loadError,mounted,dismounted};
}
export function ridingLabels(doc) {
  const lang = doc.documentElement?.dataset?.lang ?? doc.documentElement?.lang ?? 'ko';
  return labels[lang] ?? (lang==='zh-Hans' ? labels.zh : labels.ko);
}
