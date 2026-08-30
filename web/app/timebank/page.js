import { FeaturePage } from '../FeaturePage';

export default function Page() {
  return (
    <FeaturePage
      icon="⏳"
      title="بنك الوقت"
      tagline="بادل وقتك ومهاراتك مباشرة مع غيرك، من غير ما فلوس تتحرك."
      roadmap={[
        'تسجل مهاراتك والوقت اللي تقدر تقدمه',
        'تتقابل مع حد محتاج نفس المهارة أو عنده مهارة تانية تحتاجها',
        'تبادل مباشر يتسجل ويتقيّم داخل المنصة',
      ]}
    />
  );
}
