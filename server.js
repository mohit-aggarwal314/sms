import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve assets
app.use('/assets', express.static(path.join(__dirname, 'src-modern/assets')));

// Session setup
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// MySQL connection
const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sms_panel'
});
console.log("Connected to MySQL database!");

// configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // make sure 'uploads' folder exists
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});

export const upload = multer({ storage: storage });

// Prevent logged-in users from accessing login
function preventLoginForAuthenticated(req, res, next) {
    if (req.session.admin) return res.redirect('/dashboard.html');
    next();
}

// Protect routes
function authMiddleware(req, res, next) {
    if (!req.session.admin) return res.redirect('/index.html');
    next();
}

// Login page
app.get('/index.html', preventLoginForAuthenticated, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'src-modern', 'index.html'));
});

// Login POST (for both admin and users)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Admin login
        let [results] = await db.query("SELECT * FROM admins WHERE username = ?", [username]);

        if (results.length > 0) {
            const admin = results[0];
            const match = await bcrypt.compare(password, admin.password);
            if (match) {
                req.session.admin = { id: admin.id, username: admin.username, role: "admin" };
                return res.redirect('/dashboard.html'); // ✅ Admins
            }
        }

        // User login
        [results] = await db.query("SELECT * FROM users WHERE email = ? OR name = ?", [username, username]);
        if (results.length > 0) {
            const user = results[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.admin = { id: user.id, username: user.name, role: "user" };
                return res.redirect('/user_dashboard.html'); // ✅ Users
            }
        }

        res.redirect('/index.html?error=1');
    } catch(err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});



// Dashboard page
app.get('/dashboard.html', authMiddleware, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'src-modern', 'dashboard.html'));
});

app.get('/user_dashboard.html', authMiddleware, (req, res) => {
    if (req.session.admin.role !== "user") return res.redirect('/dashboard.html'); 
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'src-modern', 'user_dashboard.html'));
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/index.html'));
});

// ===== DASHBOARD API =====
app.get('/api/dashboard-stats', authMiddleware, async (req, res) => {
    try {
        const [credits] = await db.query("SELECT COALESCE(SUM(credits),0) AS total_credits FROM users");
        const [today] = await db.query("SELECT COALESCE(COUNT(*),0) AS sent_today FROM sms_logs WHERE DATE(created_at)=CURDATE()");
        const [month] = await db.query("SELECT COALESCE(COUNT(*),0) AS sent_month FROM sms_logs WHERE MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())");

        res.json({
            totalCredits: credits[0].total_credits,
            sentToday: today[0].sent_today,
            sentMonth: month[0].sent_month
        });
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// API for user stats (only their own credits, SMS, etc.)
app.get('/api/user-dashboard-stats', authMiddleware, async (req, res) => {
    if (req.session.admin.role !== "user") return res.status(403).json({ error: "Forbidden" });

    const userId = req.session.admin.id;

    try {
        const [credits] = await db.query("SELECT credits FROM users WHERE id=?", [userId]);
        const [today] = await db.query("SELECT COUNT(*) AS sent_today FROM sms_logs WHERE user_id=? AND DATE(created_at)=CURDATE()", [userId]);
        const [month] = await db.query("SELECT COUNT(*) AS sent_month FROM sms_logs WHERE user_id=? AND MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())", [userId]);

        res.json({
            totalCredits: credits[0]?.credits || 0,
            sentToday: today[0]?.sent_today || 0,
            sentMonth: month[0]?.sent_month || 0
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch user stats" });
    }
});


// Quick Send SMS API
app.post('/api/quick-send-sms', authMiddleware, async (req, res) => {
    const { phoneNumber, message } = req.body;
    const userId = req.session.admin.id; // logged-in admin

    if(!phoneNumber || !message){
        return res.json({ success: false, error: "Phone number and message are required" });
    }

    try {
        // get current credits
        const [admin] = await db.query("SELECT credits FROM users WHERE id = ?", [userId]);
        if(admin[0].credits < 1){
            return res.json({ success: false, error: "Not enough credits" });
        }

        // simulate sending SMS
        console.log(`Simulating SMS to ${phoneNumber}: ${message}`);

        // deduct credit
        await db.query("UPDATE users SET credits = credits - 1 WHERE id = ?", [userId]);

        // log the SMS
        await db.query("INSERT INTO sms_logs (user_id, phone_number, message, status) VALUES (?, ?, ?, ?)",
            [userId, phoneNumber, message, 'sent']);

        res.json({ success: true });
    } catch(err){
        console.error(err);
        res.json({ success: false, error: "Failed to process request" });
    }
});

// 1. Get all users
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const [users] = await db.query("SELECT id, name, email, credits, status, created_at FROM users");
        res.json({ success: true, users });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to fetch users" });
    }
});

// 2. Add a new user
app.post('/api/users', authMiddleware, async (req, res) => {
    const { name, email, password } = req.body;
    if(!name || !email || !password) return res.json({ success: false, error: "All fields required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hashedPassword]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to add user" });
    }
});

// 3. Edit user
app.put('/api/users/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { name, email, credits, status } = req.body;
    try {
        await db.query("UPDATE users SET name=?, email=?, credits=?, status=? WHERE id=?", [name, email, credits, status, id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to update user" });
    }
});

// 4. Delete user
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("DELETE FROM users WHERE id=?", [id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to delete user" });
    }
});

// 5. Assign credits
app.post('/api/users/:id/assign-credits', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { credits } = req.body;
    try {
        await db.query("UPDATE users SET credits = credits + ? WHERE id = ?", [credits, id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to assign credits" });
    }
});

// 6. Activate/Deactivate user
app.post('/api/users/:id/status', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'active' or 'inactive'
    try {
        await db.query("UPDATE users SET status=? WHERE id=?", [status, id]);
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Failed to change status" });
    }
});

// ===== USER STATS API =====
app.get('/api/user-stats', authMiddleware, async (req, res) => {
    try {
        // Total users
        const [total] = await db.query("SELECT COUNT(*) AS total FROM users");

        // Active users
        const [active] = await db.query("SELECT COUNT(*) AS active FROM users WHERE status='active'");

        // New users this month
        const [newThisMonth] = await db.query(`
            SELECT COUNT(*) AS newThisMonth 
            FROM users 
            WHERE MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE())
        `);

        // Active rate
        const activePercentage = total[0].total > 0 ? (active[0].active / total[0].total) * 100 : 0;

        res.json({
            success: true,
            stats: {
                total: total[0].total,
                active: active[0].active,
                newThisMonth: newThisMonth[0].newThisMonth,
                activePercentage
            }
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Failed to fetch user stats" });
    }
});

// ====== CREATE CAMPAIGN ======
app.post(
  "/api/campaigns",
  authMiddleware,
  upload.fields([
    { name: "contactsFile", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { message, numbersText, scheduledAt } = req.body;
      const { user, admin } = req.session;  // Check if it's a user or admin

      // Determine creator info (either admin or user)
      const creatorId = admin ? admin.id : user.id;
      const creatorType = admin ? 'admin' : 'user';

      // Process uploaded files (if any)
      const imageFile = req.files["image"] ? req.files["image"][0].filename : null;
      const videoFile = req.files["video"] ? req.files["video"][0].filename : null;
      const pdfFile   = req.files["pdf"]   ? req.files["pdf"][0].filename   : null;

      // Insert campaign into the database
      const [result] = await db.query(
        "INSERT INTO campaigns (message, creator_id, creator_type, schedule_time, status, image, video, pdf) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [message, creatorId, creatorType, scheduledAt || null, "scheduled", imageFile, videoFile, pdfFile]
      );

      const campaignId = result.insertId;
      let numbers = [];

      // Manual numbers input (textarea)
      if (numbersText) {
        numbers = numbersText.split("\n").map((num) => num.trim()).filter(Boolean);
      }

      // If CSV file is uploaded
      if (req.files["contactsFile"]) {
        const filePath = path.join(__dirname, req.files["contactsFile"][0].path);
        const csvData = [];
        
        // Read and parse CSV file
        await new Promise((resolve, reject) => {
          fs.createReadStream(filePath)
            .pipe(csvParser())
            .on("data", (row) => {
              if (row.phone) csvData.push(row.phone);
            })
            .on("end", resolve)
            .on("error", reject);
        });

        // Add CSV data to the numbers array
        numbers.push(...csvData);
        fs.unlinkSync(filePath);  // Clean up CSV file after reading
      }

      // Save numbers into the campaign_contacts table
      for (const num of numbers) {
        await db.query(
          "INSERT INTO campaign_contacts (campaign_id, phone_number, status) VALUES (?, ?, ?)",
          [campaignId, num, "pending"]
        );
      }

      res.json({ success: true, campaignId });
    } catch (err) {
      console.error(err);
      res.json({ success: false, error: "Failed to create campaign" });
    }
  }
);


// ====== SEND / EXECUTE CAMPAIGN ======
app.post("/api/campaigns/:id/send", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [campaign] = await db.query("SELECT * FROM campaigns WHERE id=?", [id]);

    if (campaign.length === 0)
      return res.json({ success: false, error: "Campaign not found" });

    const [contacts] = await db.query(
      "SELECT * FROM campaign_contacts WHERE campaign_id=?",
      [id]
    );

    for (const contact of contacts) {
      // Simulate SMS / MMS sending
      console.log(
        `Sending to ${contact.phone_number}: ${campaign[0].message}`
      );
      if (campaign[0].image) {
        console.log(`With Image: ${campaign[0].image}`);
      }
      if (campaign[0].video) {
        console.log(`With Video: ${campaign[0].video}`);
      }

      await db.query(
        "UPDATE campaign_contacts SET status=? WHERE id=?",
        ["sent", contact.id]
      );
      await db.query(
        "INSERT INTO sms_logs (user_id, phone_number, message, status) VALUES (?, ?, ?, ?)",
        [campaign[0].admin_id, contact.phone_number, campaign[0].message, "sent"]
      );
    }

    await db.query("UPDATE campaigns SET status=? WHERE id=?", ["completed", id]);

    res.json({ success: true, message: "Campaign executed successfully" });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Failed to send campaign" });
  }
});

// 3. Campaign report
app.get('/api/campaigns/:id/report', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const [contacts] = await db.query("SELECT phone_number, status FROM campaign_contacts WHERE campaign_id=?", [id]);
        res.json({ success: true, report: contacts });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Failed to fetch report" });
    }
});

// Fetch all campaigns
app.get("/api/campaigns", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, admin_id, message, status, schedule_time, created_at, image, video, pdf
      FROM campaigns
      ORDER BY created_at DESC
    `);
    res.json(rows || []);
  } catch (err) {
    console.error("Error fetching campaigns:", err);
    res.status(500).json({ error: "Error fetching campaigns", details: err.message });
  }
});

// Update campaign status
app.put("/api/campaigns/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await db.query("UPDATE campaigns SET status = ? WHERE id = ?", [status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete campaign
app.delete("/api/campaigns/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM campaigns WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ===== SMS STATS API for Chart =====
app.get('/api/sms-stats', authMiddleware, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM sms_logs
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at)
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Failed to fetch SMS stats" });
    }
});

// Get all campaign contacts
app.get("/api/campaign-contacts", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, campaign_id, phone_number, status
      FROM campaign_contacts
      ORDER BY id DESC
    `);
    res.json(rows || []);
  } catch (err) {
    console.error("Error fetching campaign contacts:", err);
    res.status(500).json({ error: "Error fetching campaign contacts", details: err.message });
  }
});

import { Parser } from "json2csv";

// Download campaign contacts as CSV
app.get("/api/campaign-contacts/download", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, campaign_id, phone_number, status
      FROM campaign_contacts
      ORDER BY id DESC
    `);

    if (!rows.length) {
      return res.status(404).json({ error: "No campaign contacts found" });
    }

    // Convert JSON → CSV
    const parser = new Parser({ fields: ["id", "campaign_id", "phone_number", "status"] });
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv");
    res.attachment("campaign_contacts.csv");
    res.send(csv);
  } catch (err) {
    console.error("Error exporting campaign contacts:", err);
    res.status(500).json({ error: "Error exporting campaign contacts", details: err.message });
  }
});


app.listen(5000, () => console.log("Server running on http://localhost:5000"));