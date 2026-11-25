const strings = {
  ko: ['말 타기', '말에서 내리기', '말 불러오기 취소', '말을 얻었습니다. 가방 옆 말 아이콘이나 H를 눌러 타세요.', '말이 준비됐습니다. 가방 옆 말 아이콘이나 H를 눌러 타세요.', '말을 저장할 수 없습니다.', '승마 자세를 준비하지 못했습니다. 다시 시도해 주세요.', '말을 불러오지 못했습니다. 다시 시도해 주세요.'],
  en: ['Mount', 'Dismount', 'Cancel horse loading', 'Horse acquired. Select the horse beside your bag or press H to mount.', 'Your horse is ready. Select the horse beside your bag or press H to mount.', 'Your horse could not be saved.', 'The riding pose could not be prepared. Please try again.', 'Your horse could not be loaded. Please try again.'],
  ja: ['乗馬', '下馬', '馬の呼び出しをキャンセル', '馬を入手しました。バッグの横の馬アイコンかHキーで乗れます。', '馬の準備ができました。バッグの横の馬アイコンかHキーで乗れます。', '馬を保存できませんでした。', '騎乗姿勢を準備できませんでした。もう一度お試しください。', '馬を読み込めませんでした。もう一度お試しください。'],
  zh: ['上马', '下马', '取消召唤坐骑', '已获得坐骑。点按背包旁的马形图标或按 H 键上马。', '坐骑已就绪。点按背包旁的马形图标或按 H 键上马。', '无法保存坐骑。', '无法准备骑乘姿势，请重试。', '无法加载坐骑，请重试。'],
  vi: ['Lên ngựa', 'Xuống ngựa', 'Hủy gọi ngựa', 'Bạn đã nhận được ngựa. Chạm biểu tượng ngựa bên cạnh túi đồ hoặc nhấn H để lên ngựa.', 'Ngựa đã sẵn sàng. Chạm biểu tượng ngựa bên cạnh túi đồ hoặc nhấn H để lên ngựa.', 'Không thể lưu ngựa.', 'Không thể chuẩn bị tư thế cưỡi ngựa. Vui lòng thử lại.', 'Không thể tải ngựa. Vui lòng thử lại.']
};
const feedback={
  ko:['말에 올랐습니다.','말에서 내렸습니다.','쾌속 질주','말은 동굴 밖에서 기다립니다. 밖으로 나가면 다시 탑니다.'],
  en:['Mounted.','Dismounted.','Gallop','Your horse will wait outside the cave. You’ll mount again when you leave.'],
  ja:['馬に乗りました。','馬から降りました。','全速疾走','馬は洞窟の外で待っています。外に出るとまた騎乗します。'],
  zh:['已上马。','已下马。','全速疾驰','坐骑会在洞外等候，离开洞穴后将重新骑乘。'],
  vi:['Đã lên ngựa.','Đã xuống ngựa.','Phi nước đại','Ngựa sẽ đợi ngoài hang. Khi ra ngoài, bạn sẽ lại cưỡi ngựa.']
};
const labels={};
for(const [lang,values] of Object.entries(strings)){
 const [mount,dismount,cancel,acquired,ready,saveError,poseError,loadError]=values;
 const [mounted,dismounted,gallop,parked]=feedback[lang];
 labels[lang]={mount,dismount,cancel,acquired,ready,saveError,poseError,loadError,mounted,dismounted,gallop,parked};
}
export function ridingLabels(doc) {
  const lang = doc.documentElement?.dataset?.lang ?? doc.documentElement?.lang ?? 'ko';
  return labels[lang] ?? (lang==='zh-Hans' ? labels.zh : labels.ko);
}
