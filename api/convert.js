export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { username, url } = req.body;

    if (!username || !url) {
      return res.status(400).json({
        success: false,
        error: "Thiếu username hoặc url"
      });
    }

    let finalUrl = url;

    // 1. Giải mã link rút gọn s.shopee.vn để lấy link gốc
    if (url.includes("s.shopee.")) {
      const expand = await fetch(
        `https://hoantien-spo.vercel.app/api/expand?url=${encodeURIComponent(url)}`
      );
      const json = await expand.json();
      finalUrl = json.expandedUrl;
    }

    // Bỏ toàn bộ query phía sau dấu ? để lấy link sạch
    finalUrl = finalUrl.split("?")[0];

    // ========================================================
    // BƯỚC THÊM MỚI: TỰ ĐỘNG CÀO THÔNG TIN SẢN PHẨM (ĐỘNG 100%)
    // ========================================================
    let productTitle = "Sản phẩm liên kết Shopee";
    let productPrice = "Đang cập nhật";
    let productImg = "https://placehold.co/100x100?text=Shopee";
    let productCommission = "Đang tính toán";

    try {
      // Trích xuất Item ID và Shop ID từ URL gốc của Shopee
      // Cấu hình link Shopee thường có dạng: ...i.SHOPID.ITEMID
      const match = finalUrl.match(/i\.(\d+)\.(\d+)/);
      
      if (match && match[1] && match[2]) {
        const shopId = match[1];
        const itemId = match[2];

        // Gọi API công khai của Shopee để lấy thông tin chi tiết item (Không sợ bị chặn)
        const shopeeApiUrl = `https://shopee.vn/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`;
        const shopeeRes = await fetch(shopeeApiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (shopeeRes.ok) {
          const resJson = await shopeeRes.json();
          const itemData = resJson.data;

          if (itemData) {
            // Lấy tên thật sản phẩm
            productTitle = itemData.name || productTitle;
            
            // Lấy ảnh thật sản phẩm
            if (itemData.image) {
              productImg = `https://down-vn.img.susercontent.com/file/${itemData.image}`;
            }

            // Lấy giá thật (Shopee trả về giá nhân cho 100.000 nên cần chia lại)
            if (itemData.price) {
              const realPrice = itemData.price / 100000;
              productPrice = "₫" + realPrice.toLocaleString('vi-VN');
              
              // Giả lập tính toán hoa hồng (Ví dụ: Trung bình ngành là 10% - 15%)
              // Bạn có thể đổi số 0.15 (15%) thành phần trăm bạn muốn cắt lại cho khách
              const commMoney = Math.round(realPrice * 0.15); 
              productCommission = "₫" + commMoney.toLocaleString('vi-VN') + " (15%)";
            }
          }
        }
      }
    } catch (scrapeErr) {
      console.error("Lỗi cào dữ liệu sản phẩm:", scrapeErr.message);
      // Nếu lỗi thì giữ nguyên thông tin mặc định để không chết App
    }
    // ========================================================

    // 2. Tạo link Affiliate đóng gói
    const affiliateId = "17340760181";
    const affiliateLink = `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(finalUrl)}&affiliate_id=${affiliateId}&sub_id=${encodeURIComponent(username)}`;

    // 3. Trả về đầy đủ dữ liệu dạng JSON cho Apps Script đọc
    return res.status(200).json({
      success: true,
      result: affiliateLink,    // Link cho nút bấm
      title: productTitle,       // Tên sản phẩm động
      price: productPrice,       // Giá động
      image: productImg,         // Ảnh động
      commission: productCommission // Hoa hồng động
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
