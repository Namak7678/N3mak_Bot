import { FeaturePage } from '../FeaturePage';

export default function Page() {
  return (
    <FeaturePage
      icon="🤝"
      title="المفاوض الآلي"
      tagline="وكيل ذكاء اصطناعي يتفاوض نيابة عنك مع المهتمين بموردك."
      roadmap={[
        'تحدد أقل سعر مقبول عندك',
        'الوكيل يرد على استفسارات المهتمين ويفاوض تلقائيًا',
        'توصلك رسالة بس لما تتفق فعليًا على صفقة',
      ]}
    />
  );
}
