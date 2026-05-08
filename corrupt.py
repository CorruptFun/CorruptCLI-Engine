import os
import shutil
import re
import json
import uuid

def get_input(prompt, default=""):
    val = input(f"💠 {prompt} [{default}]: ").strip()
    return val if val else default

def corrupt_init():
    print("\n" + "="*50)
    print("💠 CORRUPT SOLUTIONS | SAAS ENGINE INITIALIZER 💠")
    print("="*50)
    
    # 1. Project Info
    print("\n[1/4] IDENTITY & BRANDING")
    client_name = get_input("Client Name", "Acme Corp")
    domain = get_input("Domain", "example.com")
    admin_email = get_input("Admin Email", "admin@example.com")
    primary_color = get_input("Primary Color (Hex)", "#D4AF37")
    
    # 2. Infrastructure Mode
    print("\n[2/4] DEPLOYMENT MODE")
    print("S) Single-Tenant (Dedicated Supabase project)")
    print("M) Multi-Tenant (Shared Supabase instance)")
    mode = get_input("Select Mode (S/M)", "S").upper()
    
    org_id = "NULL"
    if mode == "M":
        org_id = str(uuid.uuid4())
        print(f"✅ Generated Organization ID: {org_id}")

    # 3. Connectivity
    print("\n[3/4] CONNECTIVITY")
    supabase_url = get_input("Supabase Project URL", "YOUR_SUPABASE_URL")
    supabase_anon = get_input("Supabase Anon Key", "YOUR_SUPABASE_ANON_KEY")
    
    # 4. Scaffolding
    print("\n[4/4] SCAFFOLDING")
    safe_name = re.sub(r'[^a-z0-9]', '-', client_name.lower())
    target_dir = f"projects/clients/{safe_name}"
    
    if os.path.exists(target_dir):
        confirm = input(f"⚠️  Directory {target_dir} already exists. Overwrite? (y/n): ")
        if confirm.lower() != 'y':
            print("Aborted.")
            return
        shutil.rmtree(target_dir)
        
    print(f"\n🚀 Creating {target_dir}...")
    base_engine = "engine"
    if not os.path.exists(base_engine):
        base_engine = "projects/corrupt-solutions/engine"
        
    shutil.copytree(base_engine, target_dir)
    
    # Define replacements
    replacements = {
        "SaaS Boilerplate": client_name,
        "yourdomain.com": domain,
        "admin@example.com": admin_email,
        "YOUR_SUPABASE_URL": supabase_url,
        "YOUR_SUPABASE_ANON_KEY": supabase_anon,
        "#D4AF37": primary_color,
        "Acme Corp": client_name,
        "ORG_ID_PLACEHOLDER": org_id if mode == "M" else "null"
    }
    
    print("🔧 Injecting client configurations...")
    count = 0
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            if file.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.mp4', '.git')):
                continue
                
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = content
                for placeholder, value in replacements.items():
                    new_content = new_content.replace(placeholder, value)
                
                if new_content != content:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    count += 1
            except Exception as e:
                pass

    print(f"\n✅ Initialization Complete!")
    print(f"📁 Project: {target_dir}")
    print(f"📝 Files Configured: {count}")
    print(f"🏗️  Mode: {'Single-Tenant' if mode == 'S' else 'Multi-Tenant'}")
    
    if mode == "M":
        print(f"\n⚠️  IMPORTANT: Manual Action Required")
        print(f"1. Add this Org to your 'organizations' table:")
        print(f"   INSERT INTO organizations (id, name, slug) VALUES ('{org_id}', '{client_name}', '{safe_name}');")
        print(f"2. Link your Admin User ({admin_email}) to this Org:")
        print(f"   INSERT INTO user_roles (user_id, org_id, role) ")
        print(f"   SELECT id, '{org_id}', 'admin' FROM auth.users WHERE email = '{admin_email}';")

    print("\n💠 PRO-TIP FOR AGENTS:")
    print(f"To finalize, navigate to {target_dir} and run:")
    print("1. git init")
    print("2. vercel link")
    print("3. supabase link --project-ref YOUR_REF")
    print("\n---------------------------------------------\n")

if __name__ == "__main__":
    corrupt_init()
