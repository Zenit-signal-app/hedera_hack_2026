
import regex as re
from fastapi import APIRouter
from redis import ConnectionPool, SSLConnection
from datetime import datetime, timedelta


def at_every_n_min(minutes: int) -> int:
    time = datetime.now() + timedelta(minutes=minutes)
    ts = int(time.replace(minute=time.minute // minutes * minutes, second=0, microsecond=0).timestamp())
    return ts

def at_every_hours_min(minutes: int) -> int:
    time = datetime.now() + timedelta(hours=1)
    ts = int(time.replace(minute=minutes, second=0, microsecond=0).timestamp())
    return ts

CACHE_PATHS = {
    'GET': {},
    'POST': {},
    'GET-MATCH': {},
    'POST-MATCH': {},
    'PUT-MATCH': {},
}
CACHE_TYPE = {
    'no-exp':
        {
            'type': 'no-exp',
            'ttl': None,
        },
    'in-1m':
        {
            'type': 'duration',
            'ttl': 60,
        },
    'in-5m':
        {
            'type': 'duration',
            'ttl': 300,
        },
    'in-30m':
        {
            'type': 'duration',
            'ttl': 1800,
        },
    'in-1h':
        {
            'type': 'duration',
            'ttl': 3600,
        },
    'at-eh-m5':
        {
            'type': 'at-time',
            'ttl': at_every_hours_min(5),
        },
    'at-eh-m10':
        {
            'type': 'at-time',
            'ttl': at_every_hours_min(10),
        },
    'at-e5m':
        {
            'type': 'at-time',
            'ttl': at_every_n_min(5),
        },
    'at-e30m':
        {
            'type': 'at-time',
            'ttl': at_every_n_min(30),
        },
}

def get_cache_type(method: str, path: str) -> str | None:
    """ check if path is in cache list, return cache type if exist, else return None
    """
    path = path.strip().rstrip('/')
    try:
        return CACHE_PATHS[method][path]
    except Exception as e:
        for key in CACHE_PATHS[method+'-MATCH']:
            if re.match(key, path):
                return CACHE_PATHS[method+'-MATCH'][key]
        print(e)
        return None
    
# add path
def router_cache(router:APIRouter, prefix:str, cahce_type:str='in-1m', spec_method:str='ALL') -> None:
    spec_method = spec_method.upper()
    if spec_method == 'ALL':
        for route in router.routes:
            # skip path end with '/' to avoid duplicate cache
            if route.path[-1:] == '/':
                continue
            path = prefix+route.path
            if '{' in path and '}' in path:
                path = r'^' + re.sub(r'\{\w+\}', r'[^\/]+', path.replace(r'/',r'\/')) + r'$'
                for method in route.methods:
                    CACHE_PATHS[method+'-MATCH'][path] = cahce_type
            else:
                for method in route.methods:
                    CACHE_PATHS[method][path] = cahce_type
    else:
        for route in router.routes:
            # skip path end with '/' to avoid duplicate cache
            if route.path[-1:] == '/':
                continue
            path = prefix+route.path
            if spec_method in route.methods and '{' in path and '}' in path:
                path = r'^' + re.sub(r'\{\w+\}', '[^\/]+', path.replace('/','\/')) + r'$'
                for method in route.methods:
                    CACHE_PATHS[spec_method+'-MATCH'][path] = cahce_type
            else:
                if spec_method in route.methods:
                    CACHE_PATHS[spec_method][path] = cahce_type
