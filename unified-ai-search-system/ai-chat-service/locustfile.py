from locust import HttpUser, task, between
import uuid

class ChatUser(HttpUser):
    wait_time = between(1, 3)  # Simulate user think time

    def on_start(self):
        # Each simulated user gets a unique session for multi-turn
        self.session_id = f"locust_{uuid.uuid4()}"
        self.conversation_history = []

    @task
    def multi_turn_chat(self):
        # First turn
        payload1 = {
            "message": "What is the capital of France?",
            "session_id": self.session_id,
            "quality_requirement": "balanced",
            "max_cost": 0.10,
            "max_execution_time": 10.0,
            "force_local_only": False,
            "response_style": "balanced",
            "include_sources": False,
            "include_debug_info": False,
            "user_context": {},
        }
        with self.client.post("/api/v1/chat/complete", json=payload1, catch_response=True) as resp1:
            if resp1.status_code == 200:
                data = resp1.json()
                self.conversation_history = data["data"].get("conversation_history", [])
            else:
                resp1.failure(f"First turn failed: {resp1.text}")

        # Second turn (if first succeeded)
        if self.conversation_history:
            payload2 = {
                "message": "And what about Germany?",
                "session_id": self.session_id,
                "quality_requirement": "balanced",
                "max_cost": 0.10,
                "max_execution_time": 10.0,
                "force_local_only": False,
                "response_style": "balanced",
                "include_sources": False,
                "include_debug_info": False,
                "user_context": {"conversation_history": self.conversation_history},
            }
            with self.client.post("/api/v1/chat/complete", json=payload2, catch_response=True) as resp2:
                if resp2.status_code == 200:
                    data = resp2.json()
                    self.conversation_history = data["data"].get("conversation_history", [])
                else:
                    resp2.failure(f"Second turn failed: {resp2.text}")
