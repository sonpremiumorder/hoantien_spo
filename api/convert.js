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

    // 1. Giải mã link rút gọn s.shopee.vn thành link gốc
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
    // ĐOẠN LẤY THÔNG TIN SẢN PHẨM TỰ ĐỘNG (ĐỘNG 100% THEO LINK)
    // ========================================================
    let productTitle = "Sản phẩm liên kết Shopee";
    let productPrice = "Đang cập nhật";
    let productImg = "https://placehold.co/100x100?text=Shopee";
    let productCommission = "Đang tính toán";

    try {
      // Tách Shop ID và Item ID từ link gốc của Shopee (ví dụ định dạng: ...i.SHOPID.ITEMID)
      const match = finalUrl.match(/i\.(\d+)\.(\d+)/);
      
      if (match && match[1] && match[2]) {
        const shopId = match[1];
        const itemId = match[2];

        // Gọi thẳng vào API hệ thống công khai của Shopee để lấy thông tin thật
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
            // Lấy tên thật sản phẩm vừa dán
            productTitle = itemData.name || productTitle;
            
            // Lấy ảnh gốc thật của sản phẩm vừa dán
            if (itemData.image) {
              productImg = `https://down-vn.img.susercontent.com/file/${itemData.image}`;
            }

            // Lấy giá thật (Shopee lưu đơn vị nhân 100.000 nên phải chia lại)
            if (itemData.price) {
              const realPrice = itemData.price / 100000;
              productPrice = "₫" + realPrice.toLocaleString('vi-VN');
              
              // Tự động tính tiền hoa hồng động (Ví dụ bạn trích lại 15% giá trị sản phẩm)
              const commMoney = Math.round(realPrice * 0.15); 
              productCommission = "₫" + commMoney.toLocaleString('vi-VN') + " (15%)";
            }
          }
        }
      }
    } catch (scrapeErr) {
      console.error("Lỗi lấy thông tin Shopee:", scrapeErr.message);
    }
    // ========================================================

    // 2. Tạo link Affiliate đóng gói của bạn
    const affiliateId = "17340760181";
    const affiliateLink = `https://s.shopee.sg/an_redir?origin_link=${encodeURIComponent(finalUrl)}&affiliate_id=${affiliateId}&sub_id=${encodeURIComponent(username)}`;

    // 3. Trả về cục dữ liệu động ĐẦY ĐỦ cho Google Apps Script
    return res.status(200).json({
      success: true,
      result: affiliateLink,    
      title: productTitle,       
      price: productPrice,       
      image: productImg,         
      commission: productCommission 
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
