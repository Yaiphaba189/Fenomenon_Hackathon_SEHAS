import os
from backend.services import database as db

def test_auth():
    print(f"SEHAS_API_KEY from env: {os.getenv('SEHAS_API_KEY')}")
    try:
        conn = db.get_db_connection()
        print("Database connection successful.")
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM patients;")
            count = cur.fetchone()[0]
            print(f"Found {count} patients in database.")
            
            cur.execute("SELECT name, email FROM patients LIMIT 1;")
            patient = cur.fetchone()
            if patient:
                print(f"Sample patient: {patient[0]} ({patient[1]})")
            else:
                print("No patients found in DB.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_auth()
