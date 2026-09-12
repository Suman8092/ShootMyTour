import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createAdminClient } from "@insforge/sdk";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(resolve(ROOT, ".env.local")); } catch {}

const { initDb, all, get, run } = await import("../server/db-adapter.mjs");

async function main() {
  await initDb();
  console.log("Connected to database successfully.");

  const insforgeAdmin = createAdminClient({
    baseUrl: process.env.INSFORGE_URL,
    apiKey: process.env.INSFORGE_API_KEY,
  });

  // 1. Elevate sumankumar829278@gmail.com to SUPER_ADMIN
  await run("UPDATE users SET role='SUPER_ADMIN' WHERE email='sumankumar829278@gmail.com'");
  const adminUser = await get("SELECT id, name, email, role FROM users WHERE email='sumankumar829278@gmail.com'");
  console.log("Admin user:", adminUser);

  // 2. Find Suman Kumar's photographer profile
  let photoUser = await get("SELECT * FROM users WHERE email='sumank80926@gmail.com'");
  if (!photoUser) {
    console.error("Photographer user not found!");
    process.exit(1);
  }
  let photographer = await get("SELECT * FROM photographers WHERE user_id=?", photoUser.id);
  if (!photographer) {
    console.error("Photographer record not found!");
    process.exit(1);
  }
  console.log("Found photographer:", photographer.id, photoUser.name);

  // 3. Upload real sample HD photos to InsForge Cloud Storage
  const sampleImages = [
    {
      source: "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1400&q=85",
      caption: "Delhi Heritage Sunset at Humayun's Tomb",
      category: "Heritage",
      name: `delhi_humayun_final.jpg`
    },
    {
      source: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=1400&q=85",
      caption: "Candid Sunset & Architecture Portrait Walk",
      category: "Portrait",
      name: `delhi_portrait_final.jpg`
    },
    {
      source: "https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=1400&q=85",
      caption: "Timeless Monuments & Travel Memories",
      category: "Travel",
      name: `delhi_travel_final.jpg`
    }
  ];

  const avatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80";

  const uploadedUrls = [];
  for (const img of sampleImages) {
    console.log(`Downloading and uploading ${img.caption}...`);
    const resp = await fetch(img.source);
    const buf = Buffer.from(await resp.arrayBuffer());
    const blob = new Blob([buf], { type: "image/jpeg" });
    const { data, error } = await insforgeAdmin.storage.from("portfolios").upload(img.name, blob, {
      upsert: true
    });
    if (error) {
      console.warn("Upload note:", error.message);
      uploadedUrls.push({
        url: `${process.env.INSFORGE_URL}/api/storage/buckets/portfolios/objects/${img.name}`,
        caption: img.caption,
        category: img.category
      });
    } else {
      console.log("Uploaded successfully:", data.url);
      uploadedUrls.push({
        url: data.url,
        caption: img.caption,
        category: img.category
      });
    }
  }

  // 4. Update Photographer profile
  await run(
    `UPDATE photographers 
     SET bio=?, experience=?, languages=?, categories=?, verification='APPROVED', featured=1, image=?
     WHERE id=?`,
    "Professional candid & travel photographer based in Delhi NCR with 5+ years experience. Specializes in portrait sessions, pre-weddings, and destination travel shoots at historic monuments including India Gate, Humayun's Tomb, Lodhi Garden, and Lotus Temple.",
    5,
    "Hindi, English",
    "Travel, Portrait, Couple",
    avatarUrl,
    photographer.id
  );
  console.log("Updated photographer profile.");

  // 5. Update existing Package & Add second Package
  const existingPkg = await get("SELECT id FROM packages WHERE photographer_id=?", photographer.id);
  if (existingPkg) {
    await run(
      `UPDATE packages 
       SET title=?, description=?, price=?, duration=?, photos=?, delivery_days=?, active=1, approved=1
       WHERE id=?`,
      "Delhi Heritage Walk & Portrait",
      "1-Hour candid portrait and heritage walk at historic Delhi landmarks. Includes 35 high-resolution color-graded photos delivered in an online gallery.",
      249900,
      60,
      35,
      3,
      existingPkg.id
    );
    console.log("Updated existing package:", existingPkg.id);
  }

  const pkg2 = await get("SELECT id FROM packages WHERE photographer_id=? AND title='Monuments & Pre-Wedding Experience'", photographer.id);
  if (!pkg2) {
    const pkg2Id = "delhi-prewedding-" + Date.now().toString(36);
    await run(
      `INSERT INTO packages(id, photographer_id, title, description, price, duration, photos, delivery_days, active, approved)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pkg2Id,
      photographer.id,
      "Monuments & Pre-Wedding Experience",
      "2-Hour premium session across multiple Delhi monument spots with outfit changes. Includes 75 high-resolution professionally retouched photos delivered in 3 days.",
      499900,
      120,
      75,
      3,
      1,
      1
    );
    console.log("Created second package for Suman Kumar.");
  }

  // 6. Update / Insert Portfolios
  await run("DELETE FROM portfolios WHERE photographer_id=?", photographer.id);
  let sortOrder = 0;
  for (const item of uploadedUrls) {
    const portId = "port-" + Math.random().toString(36).slice(2, 10);
    await run(
      `INSERT INTO portfolios(id, photographer_id, image, caption, category, approved, sort_order)
       VALUES(?, ?, ?, ?, ?, 1, ?)`,
      portId,
      photographer.id,
      item.url,
      item.caption,
      item.category,
      sortOrder++
    );
  }
  console.log(`Inserted ${uploadedUrls.length} portfolio images.`);

  // 7. Add upcoming availability slots for the next 14 days
  const nowMs = Date.now();
  for (let day = 1; day <= 14; day++) {
    const d = new Date(nowMs + day * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const morningSlot = "slot-m-" + dateStr + "-" + photographer.id.slice(0, 6);
    const eveningSlot = "slot-e-" + dateStr + "-" + photographer.id.slice(0, 6);

    const morningStart = `${dateStr}T09:00:00.000Z`;
    const morningEnd = `${dateStr}T13:00:00.000Z`;
    const eveningStart = `${dateStr}T14:00:00.000Z`;
    const eveningEnd = `${dateStr}T18:30:00.000Z`;

    await run(
      `INSERT INTO slots(id, photographer_id, start_at, end_at, blocked)
       VALUES(?, ?, ?, ?, 0)
       ON CONFLICT (id) DO NOTHING`,
      morningSlot,
      photographer.id,
      morningStart,
      morningEnd
    ).catch(() => {});

    await run(
      `INSERT INTO slots(id, photographer_id, start_at, end_at, blocked)
       VALUES(?, ?, ?, ?, 0)
       ON CONFLICT (id) DO NOTHING`,
      eveningSlot,
      photographer.id,
      eveningStart,
      eveningEnd
    ).catch(() => {});
  }
  console.log("Generated availability slots for next 14 days.");

  console.log("All done successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
