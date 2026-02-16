"""
DRACIN Locust Stress Test
Run: locust -f locustfile.py --host=https://dracinshort.xyz
"""
from locust import HttpUser, task, between, tag, events
import random
import time

SEARCHES = ['love','drama','romance','action','comedy','thriller','mystery']
SOURCES_THEATERS = ['netshort','dotdrama','flickreels','goodshort','idrama','melolo','bilitv','shortmax','velolo','stardusttv','vigloo']

class BrowseUser(HttpUser):
    """Simulates a casual browser"""
    wait_time = between(1, 3)
    weight = 5

    @task(3)
    @tag('browse')
    def homepage(self):
        self.client.get("/api/dramabox/trending", name="/api/dramabox/trending")

    @task(3)
    @tag('browse')
    def reelshort_home(self):
        self.client.get("/api/reelshort/homepage", name="/api/reelshort/homepage")

    @task(2)
    @tag('browse')
    def dramawave_home(self):
        self.client.get("/api/dramawave/home", name="/api/dramawave/home")

    @task(2)
    @tag('browse')
    def random_source(self):
        src = random.choice(SOURCES_THEATERS)
        self.client.get(f"/api/{src}/theaters", name=f"/api/[source]/theaters")

    @task(2)
    @tag('search')
    def search(self):
        q = random.choice(SEARCHES)
        src = random.choice(['dramabox','reelshort','netshort','dramawave'])
        param = 'query' if src in ['dramabox','netshort','reelshort'] else 'q'
        self.client.get(f"/api/{src}/search?{param}={q}", name="/api/[source]/search")

    @task(1)
    @tag('health')
    def health(self):
        self.client.get("/api/health", name="/api/health")

    @task(1)
    @tag('vip')
    def vip_plans(self):
        self.client.get("/api/vip/plans", name="/api/vip/plans")


class AuthUser(HttpUser):
    """Simulates login attempts"""
    wait_time = between(0.1, 0.5)
    weight = 2

    @task(3)
    @tag('auth')
    def login(self):
        self.client.post("/api/auth/login",
            json={"username": f"stress_{random.randint(1,9999)}", "password": "StressTest123!"},
            name="/api/auth/login")

    @task(1)
    @tag('auth')
    def check_username(self):
        self.client.get(f"/api/auth/check-username?username=stress_{random.randint(1,99999)}",
            name="/api/auth/check-username")


class VIPUser(HttpUser):
    """Simulates VIP access patterns"""
    wait_time = between(0.5, 2)
    weight = 1

    @task(2)
    @tag('vip')
    def plans(self):
        self.client.get("/api/vip/plans", name="/api/vip/plans")

    @task(1)
    @tag('referral')
    def referral_settings(self):
        self.client.get("/api/referral/settings", name="/api/referral/settings")

    @task(1)
    @tag('referral')
    def referral_lookup(self):
        self.client.get(f"/api/referral/lookup/REF{random.randint(1,999)}", name="/api/referral/lookup")
