import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { firestore as db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import LoadingScreen from '@/components/LoadingScreen';

const SlugResolverPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const resolveSlug = async () => {
      if (!slug) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        // 📌 ค้นหาข้อมูลจากคอลเลกชัน slugs
        const slugDocRef = doc(db, 'slugs', slug);
        const slugDocSnap = await getDoc(slugDocRef);

        if (slugDocSnap.exists()) {
          const data = slugDocSnap.data();
          const schoolId = data.schoolId || data.targetId;

          // 📌 บันทึก schoolId ลงใน localStorage เพื่อให้หน้า Login นำไปใช้แสดงผล
          if (schoolId) {
            localStorage.setItem('tenant_school_id', schoolId);
            
            // ถ้าเป็น Slug ของโปรไฟล์ อาจจะไปหน้าโปรไฟล์ แต่ถ้าเป็นโรงเรียน ไปหน้า Login ของโรงเรียนนั้น
            if (data.targetType === 'school') {
              navigate('/login', { replace: true });
            } else {
              navigate('/login', { replace: true }); // ปรับเปลี่ยนตามความต้องการในอนาคต
            }
          } else {
            navigate('/login', { replace: true });
          }
        } else {
          // ถ้าไม่เจอ Slug ให้ไปหน้า Login ปกติ
          navigate('/login', { replace: true });
        }
      } catch (error) {
        console.error("Error resolving slug:", error);
        navigate('/login', { replace: true });
      }
    };

    resolveSlug();
  }, [slug, navigate]);

  return <LoadingScreen />;
};

export default SlugResolverPage;
