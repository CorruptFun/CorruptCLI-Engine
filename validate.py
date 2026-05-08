import os
import sys
import requests
import json

def check_env():
    print("\n" + "="*50)
    print("🛡️  CORRUPT SOLUTIONS | PRE-FLIGHT AUDITOR 🛡️")
    print("="*50)
    
    # Configuration
    checks = {
        "Supabase Frontend": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        "Supabase Backend": ["SUPABASE_SERVICE_ROLE_KEY"],
        "Stripe Connectivity": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
    }
    
    status = True
    
    # 1. Check Variables
    print("\n[1/3] Verifying Environment Variables")
    for category, vars in checks.items():
        print(f"\n--- {category} ---")
        for var in vars:
            val = os.environ.get(var)
            if val and "YOUR_" not in val:
                print(f"✅ {var: <30} [SET]")
            else:
                print(f"❌ {var: <30} [MISSING OR PLACEHOLDER]")
                status = False

    # 2. Test Supabase API
    print("\n[2/3] Testing Supabase Connectivity")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    if url and key and "YOUR_" not in url:
        try:
            res = requests.get(f"{url}/rest/v1/", headers={"apikey": key})
            if res.status_code == 200:
                print("✅ Supabase REST API connection: SUCCESS")
            else:
                print(f"❌ Supabase REST API connection: FAILED (Status {res.status_code})")
                status = False
        except Exception as e:
            print(f"❌ Supabase Connection Error: {e}")
            status = False
    else:
        print("⏭️  Skipping Supabase test (keys not configured).")

    # 3. Test Stripe API (If Key Present)
    print("\n[3/3] Testing Stripe Connectivity")
    stripe_key = os.environ.get("STRIPE_SECRET_KEY")
    if stripe_key and "YOUR_" not in stripe_key:
        try:
            res = requests.get("https://api.stripe.com/v1/accounts", auth=(stripe_key, ""))
            if res.status_code == 200:
                print("✅ Stripe API connection: SUCCESS")
            else:
                print(f"❌ Stripe API connection: FAILED (Status {res.status_code})")
                status = False
        except Exception as e:
            print(f"❌ Stripe Connection Error: {e}")
            status = False
    else:
        print("⏭️  Skipping Stripe test (keys not configured).")

    print("\n" + "="*50)
    if status:
        print("🟢 PRE-FLIGHT STATUS: READY FOR DEPLOYMENT")
    else:
        print("🔴 PRE-FLIGHT STATUS: CONFIGURATION REQUIRED")
    print("="*50 + "\n")

if __name__ == "__main__":
    check_env()
