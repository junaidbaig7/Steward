import client from './client'

export const searchApi = {
  /** Natural-language hybrid search: embeddings + pgvector + structured SQL filters. */
  semantic: (params) => client.get('/search', { params }).then((r) => r.data),
}

export const SEARCH_EXAMPLES = [
  'Spicy chicken under ₹300',
  'Healthy vegetarian, not too expensive',
  'Something cheesy for dinner',
  'Light soup for a cold evening',
  'Seafood curry with coconut',
]
