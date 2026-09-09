(() => {
  "use strict";

  const DB_NAME = "massar-offline";
  const DB_VERSION = 1;
  const SESSION_KEY = "auth:offline-session";
  const DEVICE_ID_KEY = "massar.offline.deviceId";
  const STORES = { customers: "customers", outbox: "outbox", meta: "meta" };

  let session = null;
  let customers = [];

  const el = (id) => document.getElementById(id);
  const signedOut = el("signedOut");
  const workspace = el("workspace");
  const customerForm = el("customerForm");
  const customerId = el("customerId");
  const nameInput = el("name");
  const phoneInput = el("phone");
  const emailInput = el("email");
  const notesInput = el("notes");
  const cancelEdit = el("cancelEdit");
  const formTitle = el("formTitle");
  const message = el("message");

  function uuid() {
    if (self.crypto && typeof self.crypto.randomUUID === "function") return self.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function getDeviceId() {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  }

  function clean(value) {
    const trimmed = String(value || "").trim();
    return trimmed || null;
  }

  function normalizePhone(phone) {
    const trimmed = String(phone || "").trim();
    if (!trimmed) return null;
    const hasPlus = trimmed.startsWith("+");
    const digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;
    return hasPlus ? `+${digits}` : digits;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.customers)) {
          const store = db.createObjectStore(STORES.customers, { keyPath: "id" });
          store.createIndex("shopId", "shopId", { unique: false });
          store.createIndex("shopUpdatedAt", ["shopId", "updatedAt"], { unique: false });
          store.createIndex("shopPhoneNormalized", ["shopId", "phoneNormalized"], { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.outbox)) {
          const store = db.createObjectStore(STORES.outbox, { keyPath: "operationId" });
          store.createIndex("shopStatusCreatedAt", ["shopId", "status", "createdAt"], { unique: false });
          store.createIndex("entityId", "entityId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة البيانات المحلية."));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("فشلت عملية التخزين المحلية."));
    });
  }

  async function getMeta(key) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.meta, "readonly");
      const row = await requestResult(tx.objectStore(STORES.meta).get(key));
      return row && typeof row.value === "string" ? row.value : null;
    } finally {
      db.close();
    }
  }

  async function setMeta(key, value) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.meta, "readwrite");
      await requestResult(tx.objectStore(STORES.meta).put({ key, value }));
    } finally {
      db.close();
    }
  }

  async function readSession() {
    const raw = await getMeta(SESSION_KEY);
    if (!raw) return null;
    try {
      const snapshot = JSON.parse(raw);
      if (!snapshot || !snapshot.user || !snapshot.user.id || !snapshot.shop || !snapshot.shop.id || !snapshot.expiresAt) return null;
      if (new Date(snapshot.expiresAt).getTime() <= Date.now()) return null;
      return snapshot;
    } catch {
      return null;
    }
  }

  async function listCustomers(shopId) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.customers, "readonly");
      const rows = await requestResult(tx.objectStore(STORES.customers).index("shopId").getAll(shopId));
      return rows.filter((row) => !row.deletedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    } finally {
      db.close();
    }
  }

  async function getCustomer(id) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.customers, "readonly");
      return await requestResult(tx.objectStore(STORES.customers).get(id));
    } finally {
      db.close();
    }
  }

  async function putCustomer(customer) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.customers, "readwrite");
      await requestResult(tx.objectStore(STORES.customers).put(customer));
    } finally {
      db.close();
    }
  }

  async function queueMutation(customer, mutationType, payload, baseVersion) {
    const mutation = {
      operationId: uuid(),
      deviceId: getDeviceId(),
      shopId: session.shop.id,
      userId: session.user.id,
      entityType: "customer",
      entityId: customer.id,
      mutationType,
      baseVersion,
      payload,
      createdAt: new Date().toISOString(),
      status: "pending",
      retryCount: 0,
      lastError: null,
    };
    const db = await openDb();
    try {
      const tx = db.transaction(STORES.outbox, "readwrite");
      await requestResult(tx.objectStore(STORES.outbox).put(mutation));
    } finally {
      db.close();
    }
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.remove("hidden", "error");
    if (isError) message.classList.add("error");
    window.setTimeout(() => message.classList.add("hidden"), 3500);
  }

  function resetForm() {
    customerForm.reset();
    customerId.value = "";
    formTitle.textContent = "إضافة عميل";
    cancelEdit.classList.add("hidden");
  }

  function makeButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }

  function renderCustomers() {
    const root = el("customers");
    root.replaceChildren();
    el("count").textContent = `${customers.length} عميل محفوظ محلياً`;

    if (!customers.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "لا يوجد عملاء محفوظون على هذا الجهاز لهذا المتجر بعد.";
      root.appendChild(empty);
      return;
    }

    for (const customer of customers) {
      const row = document.createElement("div");
      row.className = "customer";
      const info = document.createElement("div");
      info.className = "grow";
      const title = document.createElement("h3");
      title.textContent = customer.name;
      info.appendChild(title);
      if (customer.phone) {
        const p = document.createElement("p");
        p.textContent = customer.phone;
        info.appendChild(p);
      }
      if (customer.email) {
        const p = document.createElement("p");
        p.textContent = customer.email;
        info.appendChild(p);
      }

      const actions = document.createElement("div");
      actions.className = "row";
      if (customer.syncStatus !== "synced") {
        const sync = document.createElement("span");
        sync.className = "sync";
        sync.textContent = customer.syncStatus === "conflict" ? "تعارض" : "بانتظار المزامنة";
        actions.appendChild(sync);
      }
      actions.appendChild(makeButton("تعديل", "ghost", () => startEdit(customer.id)));
      actions.appendChild(makeButton("حذف", "danger", () => removeCustomer(customer.id)));
      row.append(info, actions);
      root.appendChild(row);
    }
  }

  async function reloadCustomers() {
    customers = await listCustomers(session.shop.id);
    renderCustomers();
  }

  async function startEdit(id) {
    const customer = await getCustomer(id);
    if (!customer || customer.shopId !== session.shop.id || customer.deletedAt) return;
    customerId.value = customer.id;
    nameInput.value = customer.name || "";
    phoneInput.value = customer.phone || "";
    emailInput.value = customer.email || "";
    notesInput.value = customer.notes || "";
    formTitle.textContent = "تعديل العميل";
    cancelEdit.classList.remove("hidden");
    nameInput.focus();
    window.scrollTo({ top: 120, behavior: "smooth" });
  }

  async function removeCustomer(id) {
    if (!confirm("حذف العميل محلياً؟ سيتم إرسال الحذف للسيرفر عند عودة الإنترنت.")) return;
    const existing = await getCustomer(id);
    if (!existing || existing.shopId !== session.shop.id || existing.deletedAt) return;
    const now = new Date().toISOString();
    const updated = { ...existing, deletedAt: now, updatedAt: now, version: Number(existing.version || 0) + 1, syncStatus: "pending" };
    await putCustomer(updated);
    await queueMutation(updated, "customer.delete", { deletedAt: now }, Number(existing.version || 0));
    if (customerId.value === id) resetForm();
    await reloadCustomers();
    showMessage("تم حفظ الحذف محلياً وسيُزامن عند عودة الاتصال.");
  }

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const name = String(nameInput.value || "").trim();
      if (!name) throw new Error("اسم العميل مطلوب.");
      const phone = clean(phoneInput.value);
      const email = clean(emailInput.value);
      const notes = clean(notesInput.value);
      const now = new Date().toISOString();

      if (customerId.value) {
        const existing = await getCustomer(customerId.value);
        if (!existing || existing.shopId !== session.shop.id || existing.deletedAt) throw new Error("العميل غير موجود على هذا الجهاز.");
        const updated = {
          ...existing,
          name,
          phone,
          phoneNormalized: normalizePhone(phone),
          email,
          notes,
          updatedAt: now,
          version: Number(existing.version || 0) + 1,
          syncStatus: "pending",
        };
        await putCustomer(updated);
        await queueMutation(updated, "customer.update", { name, phone, phoneNormalized: updated.phoneNormalized, email, notes }, Number(existing.version || 0));
        showMessage("تم حفظ التعديل محلياً.");
      } else {
        const id = uuid();
        const customer = {
          id,
          shopId: session.shop.id,
          clientGeneratedId: id,
          name,
          phone,
          phoneNormalized: normalizePhone(phone),
          email,
          notes,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          version: 1,
          syncStatus: "pending",
        };
        await putCustomer(customer);
        await queueMutation(customer, "customer.create", {
          clientGeneratedId: id,
          name,
          phone,
          phoneNormalized: customer.phoneNormalized,
          email,
          notes,
        }, null);
        showMessage("تمت إضافة العميل محلياً.");
      }

      resetForm();
      await reloadCustomers();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "تعذر حفظ العميل محلياً.", true);
    }
  });

  cancelEdit.addEventListener("click", resetForm);

  el("retryOnline").addEventListener("click", () => {
    location.href = "/dashboard";
  });

  el("localLogout").addEventListener("click", async () => {
    await setMeta(SESSION_KEY, "");
    session = null;
    customers = [];
    workspace.classList.add("hidden");
    signedOut.classList.remove("hidden");
  });

  async function boot() {
    try {
      if (!("indexedDB" in window)) throw new Error("التخزين المحلي غير مدعوم في هذا المتصفح.");
      session = await readSession();
      if (!session) {
        signedOut.classList.remove("hidden");
        return;
      }

      el("shopName").textContent = session.shop.name || "المتجر";
      el("userName").textContent = `${session.user.name || session.user.email || "المستخدم"} · صلاحية العمل المحلي حتى ${new Date(session.expiresAt).toLocaleString("ar")}`;
      workspace.classList.remove("hidden");
      await reloadCustomers();
    } catch (error) {
      signedOut.classList.remove("hidden");
      const p = signedOut.querySelector("p");
      if (p) p.textContent = error instanceof Error ? error.message : "تعذر تشغيل وضع عدم الاتصال.";
    }
  }

  void boot();
})();
