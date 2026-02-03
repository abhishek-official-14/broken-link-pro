#!/usr/bin/env python3
"""
Backend API Testing for LinkSpider Crawler
Tests all API endpoints with real website crawling
"""

import requests
import json
import time
import sys
from datetime import datetime

class LinkSpiderAPITester:
    def __init__(self, base_url="https://linkinsight-4.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.job_id = None

    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")

    def run_test(self, name, method, endpoint, expected_status, data=None, timeout=30):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        self.log(f"Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=timeout)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=timeout)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}", "PASS")
                return True, response.json() if response.content else {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}", "FAIL")
                if response.content:
                    self.log(f"Response: {response.text[:200]}", "ERROR")
                return False, {}

        except requests.exceptions.Timeout:
            self.log(f"❌ {name} - Request timeout after {timeout}s", "FAIL")
            return False, {}
        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}", "FAIL")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "health",
            200
        )
        return success

    def test_start_crawl(self):
        """Test starting a crawl job"""
        crawl_data = {
            "url": "https://example.com",
            "maxDepth": 2,
            "maxPages": 10,
            "timeout": 5000,
            "rateLimit": 1000
        }
        
        success, response = self.run_test(
            "Start Crawl Job",
            "POST",
            "crawl",
            200,
            data=crawl_data
        )
        
        if success and 'jobId' in response:
            self.job_id = response['jobId']
            self.log(f"Job ID: {self.job_id}")
            return True
        return False

    def test_invalid_url_crawl(self):
        """Test crawl with invalid URL"""
        crawl_data = {
            "url": "not-a-valid-url",
            "maxDepth": 2
        }
        
        success, response = self.run_test(
            "Invalid URL Crawl",
            "POST",
            "crawl",
            400,
            data=crawl_data
        )
        return success

    def test_missing_url_crawl(self):
        """Test crawl without URL"""
        crawl_data = {
            "maxDepth": 2
        }
        
        success, response = self.run_test(
            "Missing URL Crawl",
            "POST",
            "crawl",
            400,
            data=crawl_data
        )
        return success

    def test_job_status(self):
        """Test getting job status"""
        if not self.job_id:
            self.log("❌ No job ID available for status test", "FAIL")
            return False
            
        success, response = self.run_test(
            "Get Job Status",
            "GET",
            f"crawl/{self.job_id}",
            200
        )
        
        if success:
            required_fields = ['jobId', 'url', 'status', 'progress', 'totalLinks', 'brokenLinks', 'pagesProcessed']
            for field in required_fields:
                if field not in response:
                    self.log(f"❌ Missing field '{field}' in job status response", "FAIL")
                    return False
            self.log(f"Job Status: {response['status']}, Progress: {response['progress']}%")
            return True
        return False

    def test_nonexistent_job_status(self):
        """Test getting status for non-existent job"""
        fake_job_id = "job_nonexistent_12345"
        success, response = self.run_test(
            "Non-existent Job Status",
            "GET",
            f"crawl/{fake_job_id}",
            404
        )
        return success

    def wait_for_crawl_completion(self, max_wait=60):
        """Wait for crawl to complete"""
        if not self.job_id:
            return False
            
        self.log("Waiting for crawl to complete...")
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                response = requests.get(f"{self.api_url}/crawl/{self.job_id}")
                if response.status_code == 200:
                    data = response.json()
                    status = data.get('status', 'unknown')
                    progress = data.get('progress', 0)
                    
                    self.log(f"Crawl status: {status}, progress: {progress}%")
                    
                    if status in ['completed', 'failed']:
                        return status == 'completed'
                        
                time.sleep(2)
            except Exception as e:
                self.log(f"Error checking crawl status: {e}", "ERROR")
                
        self.log("Crawl did not complete within timeout", "WARN")
        return False

    def test_export_json(self):
        """Test JSON export"""
        if not self.job_id:
            self.log("❌ No job ID available for JSON export test", "FAIL")
            return False
            
        success, response = self.run_test(
            "Export JSON",
            "GET",
            f"export/{self.job_id}/json",
            200
        )
        
        if success:
            # Check if response is a list (array of links)
            if isinstance(response, list):
                self.log(f"JSON export contains {len(response)} links")
                return True
            else:
                self.log("❌ JSON export should return an array of links", "FAIL")
                return False
        return False

    def test_export_csv(self):
        """Test CSV export"""
        if not self.job_id:
            self.log("❌ No job ID available for CSV export test", "FAIL")
            return False
            
        try:
            url = f"{self.api_url}/export/{self.job_id}/csv"
            response = requests.get(url, timeout=30)
            
            self.tests_run += 1
            if response.status_code == 200:
                self.tests_passed += 1
                self.log("✅ Export CSV - Status: 200", "PASS")
                
                # Check if it's CSV format
                content = response.text
                if content.startswith('URL,Status,Status Text'):
                    self.log(f"CSV export contains {len(content.split(chr(10)))} lines")
                    return True
                else:
                    self.log("❌ CSV export doesn't have expected header", "FAIL")
                    return False
            else:
                self.log(f"❌ Export CSV - Expected 200, got {response.status_code}", "FAIL")
                return False
                
        except Exception as e:
            self.log(f"❌ Export CSV - Error: {str(e)}", "FAIL")
            return False

    def test_export_nonexistent_job(self):
        """Test export for non-existent job"""
        fake_job_id = "job_nonexistent_12345"
        success, response = self.run_test(
            "Export Non-existent Job JSON",
            "GET",
            f"export/{fake_job_id}/json",
            404
        )
        return success

    def run_all_tests(self):
        """Run all backend tests"""
        self.log("Starting LinkSpider Backend API Tests")
        self.log("=" * 50)
        
        # Basic API tests
        tests = [
            ("Health Check", self.test_health_check),
            ("Invalid URL Crawl", self.test_invalid_url_crawl),
            ("Missing URL Crawl", self.test_missing_url_crawl),
            ("Start Crawl Job", self.test_start_crawl),
            ("Non-existent Job Status", self.test_nonexistent_job_status),
        ]
        
        # Run basic tests
        for test_name, test_func in tests:
            try:
                test_func()
            except Exception as e:
                self.log(f"❌ {test_name} - Exception: {str(e)}", "FAIL")
        
        # If we have a job ID, run job-specific tests
        if self.job_id:
            self.log("\nRunning job-specific tests...")
            
            # Test job status
            self.test_job_status()
            
            # Wait for crawl to complete
            crawl_completed = self.wait_for_crawl_completion()
            
            if crawl_completed:
                self.log("Crawl completed successfully, testing exports...")
                self.test_export_json()
                self.test_export_csv()
            else:
                self.log("Crawl did not complete, skipping export tests", "WARN")
            
            # Test export for non-existent job
            self.test_export_nonexistent_job()
        
        # Print results
        self.log("=" * 50)
        self.log(f"Tests completed: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!", "SUCCESS")
            return True
        else:
            self.log(f"❌ {self.tests_run - self.tests_passed} tests failed", "FAIL")
            return False

def main():
    tester = LinkSpiderAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())