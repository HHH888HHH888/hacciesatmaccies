# Deploy Haxax free & always-on — Oracle Cloud "Always Free" + haxax.com

This puts Haxax on a free Oracle VM that **never sleeps**, with automatic HTTPS on
your domain. Your only manual work: create the VM, run one script, set DNS.
Everything server-side is automated by [`deploy/setup.sh`](deploy/setup.sh).

Rough time: ~30 minutes, most of it waiting on Oracle.

---

## Part 1 — Create the free VM (Oracle console)

1. **Sign up** at <https://cloud.oracle.com>. It asks for a credit card **for identity
   verification only** — Always Free resources are never charged.
   **Pick an Australia home region** (Sydney or Melbourne) when prompted — you can't
   change it later, and it keeps the WA data fast.

2. In the console: **☰ Menu → Compute → Instances → Create instance**.
   - **Name:** `haxax`
   - **Image & shape → Edit:**
     - Image: **Canonical Ubuntu 22.04** (or 24.04).
     - Shape: click **Change shape → Ampere (ARM)** → `VM.Standard.A1.Flex`,
       set **1 OCPU / 6 GB** (well within the free 4 OCPU / 24 GB).
       *If it says "out of capacity"* (common for ARM), switch to
       **VM.Standard.E2.1.Micro** (AMD, always available). The setup script adds swap
       so the small micro still builds fine.
   - **Networking:** leave defaults; make sure **"Assign a public IPv4 address"** is on.
   - **SSH keys:** choose **Generate a key pair for me → Download private key**
     (save it, e.g. `~/haxax-key.pem`). You'll use it to log in.
   - Click **Create**. Wait until it's **Running**, then copy the **Public IP address**.

3. **Open ports 80 & 443** (so the web can reach it):
   - On the instance page, under **Primary VNIC**, click the **Subnet** link →
     click the **Default Security List** → **Add Ingress Rules**. Add two rules:
     | Source CIDR | IP Protocol | Destination Port |
     |-------------|-------------|------------------|
     | `0.0.0.0/0` | TCP         | `80`             |
     | `0.0.0.0/0` | TCP         | `443`            |
   - Save. (The setup script opens the VM's own firewall; this opens Oracle's.)

---

## Part 2 — Set it up (one script)

1. **SSH in** from your Mac's Terminal (fix key perms first):
   ```bash
   chmod 600 ~/haxax-key.pem
   ssh -i ~/haxax-key.pem ubuntu@<PUBLIC_IP>
   ```
   Type `yes` at the fingerprint prompt.

2. **Get the code.** Install GitHub CLI, log in (same device-code flow as before),
   and clone your private repo:
   ```bash
   sudo apt-get update && sudo apt-get install -y gh git
   gh auth login          # GitHub.com → HTTPS → login with a web browser
   gh repo clone HHH888HHH888/hacciesatmaccies haxax
   cd haxax
   ```

3. **Run the installer** with your domain:
   ```bash
   bash deploy/setup.sh haxax.com
   ```
   It installs Node + Caddy, opens the firewall, asks for your passwords + MiniMax key
   (press Enter to accept the `haxax888`/`haig888` defaults), builds, and starts Haxax
   as an auto-restarting service behind HTTPS. When it finishes it prints the exact DNS
   records to set.

---

## Part 3 — Point haxax.com at it (GoDaddy)

In **GoDaddy → your domain → DNS → Records**, add/replace:

| Type | Name | Value            | TTL |
|------|------|------------------|-----|
| A    | `@`  | `<PUBLIC_IP>`    | 600 |
| A    | `www`| `<PUBLIC_IP>`    | 600 |

Delete any existing parked `A`/`CNAME` on `@` or `www` that GoDaddy added.

DNS takes a few minutes to an hour. Once it resolves, Caddy automatically issues the
HTTPS certificate on first visit, and **https://haxax.com** shows your gate screen. 🔒

---

## Running it day-to-day

```bash
sudo systemctl status haxax --no-pager   # is it up?
journalctl -u haxax -f                    # live logs (Ctrl-C to exit)
sudo systemctl restart haxax              # restart
bash deploy/update.sh                      # pull latest code + rebuild + restart
```

The service starts on boot and restarts on crash, so it stays live with no babysitting.

## If https://haxax.com doesn't load
- `curl -I http://<PUBLIC_IP>` from your Mac — if that hangs, ports 80/443 aren't open
  (recheck Part 1 step 3, the Oracle security list).
- `journalctl -u haxax -e` — app errors.
- `sudo journalctl -u caddy -e` — certificate/proxy errors (often just DNS not
  propagated yet; wait and revisit).
