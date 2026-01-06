"""
WikiTree API Crawler for Funk Family Tree
Uses the official WikiTree API to fetch family tree data with proper rate limiting.

API Documentation: https://www.wikitree.com/wiki/Help:API_Documentation
GitHub: https://github.com/wikitree/wikitree-api
"""

import json
import time
import urllib.request
import urllib.parse
from collections import deque
from datetime import datetime
import os

# Configuration
API_ENDPOINT = "https://api.wikitree.com/api.php"
APP_ID = "FunkFamilyTreeCrawler"

# Rate limiting settings
REQUEST_DELAY = 1.0  # Seconds between requests (be respectful)
BATCH_SIZE = 50  # Number of profiles to fetch at once (API supports up to 100)
SAVE_INTERVAL = 25  # Save progress every N requests


class WikiTreeCrawler:
    """Crawls WikiTree using their official API."""

    def __init__(self, output_dir="C:/Users/norca/dev/funk-tree/wikitree_data"):
        self.output_dir = output_dir
        self.visited = set()
        self.queue = deque()
        self.persons = {}
        self.request_count = 0
        self.errors = []

        # Create output directory
        os.makedirs(output_dir, exist_ok=True)

        # Load previous progress if exists
        self._load_progress()

    def _load_progress(self):
        """Load previous crawling progress."""
        progress_file = os.path.join(self.output_dir, "progress.json")
        if os.path.exists(progress_file):
            try:
                with open(progress_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.visited = set(data.get('visited', []))
                    self.queue = deque(data.get('queue', []))
                    self.persons = data.get('persons', {})
                    print(f"Loaded progress: {len(self.visited)} visited, {len(self.queue)} in queue")
            except Exception as e:
                print(f"Could not load progress: {e}")

    def _save_progress(self):
        """Save crawling progress."""
        progress_file = os.path.join(self.output_dir, "progress.json")
        data = {
            'visited': list(self.visited),
            'queue': list(self.queue),
            'persons': self.persons,
            'timestamp': datetime.now().isoformat(),
            'request_count': self.request_count
        }
        with open(progress_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Saved progress: {len(self.visited)} profiles")

    def _api_request(self, action, **params):
        """Make an API request with rate limiting."""
        params['action'] = action
        params['appId'] = APP_ID
        params['format'] = 'json'

        # Build URL
        url = f"{API_ENDPOINT}?{urllib.parse.urlencode(params)}"

        headers = {
            'User-Agent': 'FunkFamilyTreeCrawler/1.0 (genealogy research project)',
            'Accept': 'application/json'
        }

        try:
            req = urllib.request.Request(url, headers=headers)
            response = urllib.request.urlopen(req, timeout=30)
            self.request_count += 1

            # Rate limiting
            time.sleep(REQUEST_DELAY)

            data = json.loads(response.read().decode('utf-8'))
            return data
        except Exception as e:
            self.errors.append({'url': url, 'error': str(e)})
            print(f"  API Error: {e}")
            time.sleep(REQUEST_DELAY * 2)  # Extra delay on error
            return None

    def get_profile(self, wiki_id):
        """Fetch a single profile by WikiTree ID (e.g., 'Funck-6')."""
        if wiki_id in self.visited:
            return self.persons.get(wiki_id)

        result = self._api_request(
            'getProfile',
            key=wiki_id,
            fields='Id,Name,FirstName,MiddleName,LastNameAtBirth,LastNameCurrent,Suffix,'
                   'BirthDate,DeathDate,BirthLocation,DeathLocation,Gender,'
                   'Father,Mother,Spouses,Children,Parents,'
                   'BirthDateDecade,DeathDateDecade,IsLiving'
        )

        if result and result[0].get('profile'):
            profile = result[0]['profile']
            self._process_profile(profile)
            return profile

        return None

    def get_ancestors(self, wiki_id, depth=3):
        """Fetch ancestors up to specified depth."""
        result = self._api_request(
            'getAncestors',
            key=wiki_id,
            depth=depth,
            fields='Id,Name,FirstName,LastNameAtBirth,BirthDate,DeathDate,'
                   'BirthLocation,Gender,Father,Mother'
        )

        if result and result[0].get('ancestors'):
            for ancestor in result[0]['ancestors']:
                self._process_profile(ancestor)
            return result[0]['ancestors']

        return []

    def get_descendants(self, wiki_id, depth=2):
        """Fetch descendants up to specified depth."""
        result = self._api_request(
            'getDescendants',
            key=wiki_id,
            depth=depth,
            fields='Id,Name,FirstName,LastNameAtBirth,BirthDate,DeathDate,'
                   'BirthLocation,Gender,Father,Mother,Children'
        )

        if result and result[0].get('descendants'):
            descendants = result[0]['descendants']
            for desc in descendants:
                self._process_profile(desc)
            return descendants

        return []

    def _process_profile(self, profile):
        """Process and store a profile."""
        if not profile:
            return

        wiki_id = profile.get('Name')
        if not wiki_id:
            return

        # Store the profile
        self.persons[wiki_id] = {
            'wiki_id': wiki_id,
            'id': profile.get('Id'),
            'name': self._build_full_name(profile),
            'first_name': profile.get('FirstName', ''),
            'middle_name': profile.get('MiddleName', ''),
            'last_name_birth': profile.get('LastNameAtBirth', ''),
            'last_name_current': profile.get('LastNameCurrent', ''),
            'suffix': profile.get('Suffix', ''),
            'gender': profile.get('Gender', 'Unknown'),
            'birth_date': profile.get('BirthDate', ''),
            'death_date': profile.get('DeathDate', ''),
            'birth_location': profile.get('BirthLocation', ''),
            'death_location': profile.get('DeathLocation', ''),
            'is_living': profile.get('IsLiving', 0),
            'father_id': profile.get('Father'),
            'mother_id': profile.get('Mother'),
            'spouse_ids': self._extract_ids(profile.get('Spouses', [])),
            'child_ids': self._extract_ids(profile.get('Children', []))
        }

        self.visited.add(wiki_id)

        # Add relatives to queue for crawling
        self._queue_relatives(profile)

    def _build_full_name(self, profile):
        """Build full name from profile fields."""
        parts = []
        if profile.get('FirstName'):
            parts.append(profile['FirstName'])
        if profile.get('MiddleName'):
            parts.append(profile['MiddleName'])
        if profile.get('LastNameAtBirth'):
            parts.append(profile['LastNameAtBirth'])
        elif profile.get('LastNameCurrent'):
            parts.append(profile['LastNameCurrent'])
        if profile.get('Suffix'):
            parts.append(profile['Suffix'])
        return ' '.join(parts) if parts else profile.get('Name', 'Unknown')

    def _extract_ids(self, items):
        """Extract WikiTree IDs from a list of items."""
        if isinstance(items, dict):
            return list(items.keys())
        elif isinstance(items, list):
            return [item.get('Name') for item in items if item.get('Name')]
        return []

    def _queue_relatives(self, profile):
        """Add relatives to the crawl queue."""
        # Helper to check if ID is valid (not 0 or empty)
        def is_valid_id(id_val):
            if not id_val:
                return False
            if isinstance(id_val, int) and id_val == 0:
                return False
            if isinstance(id_val, str) and id_val in ('0', ''):
                return False
            return True

        # Add father
        father = profile.get('Father')
        if is_valid_id(father) and str(father) not in self.visited and str(father) not in self.queue:
            self.queue.append(str(father))

        # Add mother
        mother = profile.get('Mother')
        if is_valid_id(mother) and str(mother) not in self.visited and str(mother) not in self.queue:
            self.queue.append(str(mother))

        # Add spouses - can be dict with IDs as keys, or list
        spouses = profile.get('Spouses', {})
        if isinstance(spouses, dict):
            for spouse_id in spouses.keys():
                if is_valid_id(spouse_id) and str(spouse_id) not in self.visited and str(spouse_id) not in self.queue:
                    self.queue.append(str(spouse_id))
        elif isinstance(spouses, list):
            for spouse in spouses:
                spouse_id = spouse.get('Id') or spouse.get('Name')
                if is_valid_id(spouse_id) and str(spouse_id) not in self.visited and str(spouse_id) not in self.queue:
                    self.queue.append(str(spouse_id))

        # Add children - can be dict with IDs as keys, or list
        children = profile.get('Children', {})
        if isinstance(children, dict):
            for child_id in children.keys():
                if is_valid_id(child_id) and str(child_id) not in self.visited and str(child_id) not in self.queue:
                    self.queue.append(str(child_id))
        elif isinstance(children, list):
            for child in children:
                child_id = child.get('Id') or child.get('Name')
                if is_valid_id(child_id) and str(child_id) not in self.visited and str(child_id) not in self.queue:
                    self.queue.append(str(child_id))

    def crawl(self, start_id, max_generations=7):
        """Crawl the family tree starting from a profile."""
        print(f"Starting crawl from {start_id}")
        print(f"Request delay: {REQUEST_DELAY}s")
        print(f"No max limit - will crawl until queue is empty")
        print()

        # Start with the root profile
        if start_id not in self.visited:
            print(f"Fetching root profile: {start_id}")
            self.get_profile(start_id)

        # Get descendants first (more efficient for our use case)
        print(f"\nFetching descendants (depth=2)...")
        self.get_descendants(start_id, depth=2)

        # Then crawl the queue for remaining profiles
        print(f"\nCrawling queue ({len(self.queue)} profiles)...")

        while self.queue:
            wiki_id = self.queue.popleft()

            if wiki_id in self.visited:
                continue

            print(f"  [Request #{self.request_count}] Fetching: {wiki_id} (Queue: {len(self.queue)})")
            self.get_profile(wiki_id)

            # Save progress periodically
            if self.request_count % SAVE_INTERVAL == 0:
                self._save_progress()

        # Final save
        self._save_progress()
        self._export_json()

        print(f"\nCrawl complete!")
        print(f"  Total profiles: {len(self.persons)}")
        print(f"  API requests: {self.request_count}")
        print(f"  Errors: {len(self.errors)}")
        print(f"  Remaining in queue: {len(self.queue)}")

    def _export_json(self):
        """Export data to JSON format compatible with visualization."""
        output_file = os.path.join(self.output_dir, "funk_tree_wikitree.json")

        # Calculate generations
        self._calculate_generations()

        # Build data structure
        data = {
            "metadata": {
                "source": "WikiTree",
                "start_profile": "Funck-6",
                "generated": datetime.now().isoformat(),
                "total_persons": len(self.persons),
                "api_requests": self.request_count
            },
            "persons": self.persons
        }

        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"\nExported to: {output_file}")

    def _calculate_generations(self):
        """Calculate generation numbers relative to root."""
        # Find root (person with no parents in our dataset)
        root_id = "Funck-6"  # Bishop Henry Funck

        # BFS to assign generations
        visited = set()
        queue = deque([(root_id, 0)])

        while queue:
            person_id, gen = queue.popleft()

            if person_id in visited or person_id not in self.persons:
                continue

            visited.add(person_id)
            self.persons[person_id]['generation'] = gen

            # Add children
            for child_id in self.persons[person_id].get('child_ids', []):
                if child_id not in visited:
                    queue.append((child_id, gen + 1))


def main():
    """Main entry point."""
    print("=" * 60)
    print("WIKITREE FAMILY TREE CRAWLER")
    print("Funk Family - Starting from Bishop Henry Funck")
    print("=" * 60)
    print()

    # Create crawler
    crawler = WikiTreeCrawler()

    # Start crawling from Bishop Henry Funck (Funck-6)
    crawler.crawl("Funck-6", max_generations=7)

    return crawler


if __name__ == "__main__":
    main()
